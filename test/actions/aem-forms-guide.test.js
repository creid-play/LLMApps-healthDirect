const handler = require('../../actions/aem-forms-guide/index.js')

function jsonResponse (body, status = 200, headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: name => headers[name.toLowerCase()] || null
        },
        json: jest.fn().mockResolvedValue(body)
    }
}

function mockFetch (responses) {
    global.fetch = jest.fn(async () => {
        const response = responses.shift()
        if (!response) throw new Error('Unexpected fetch call')
        return response
    })
}

describe('aem-forms-guide handler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        delete global.fetch
    })

    test('prompts for an operation when none is provided', async () => {
        global.fetch = jest.fn()
        const out = await handler({})

        expect(out.content[0].text).toMatch(/discover.*submit/i)
        expect(global.fetch).not.toHaveBeenCalled()
    })

    test('discovers published forms and returns fields in form order', async () => {
        mockFetch([
            jsonResponse({
                items: [{
                    title: 'Benefits application',
                    description: 'Apply for a health benefit.',
                    path: '/content/forms/af/benefits'
                }]
            }),
            jsonResponse({
                afModelDefinition: {
                    ':items': {
                        first: {
                            name: 'firstName',
                            fieldType: 'text-input',
                            label: { value: 'First name' },
                            required: true
                        },
                        second: {
                            name: 'plan',
                            fieldType: 'drop-down',
                            label: { value: 'Plan type' },
                            options: [{ label: 'Basic', value: 'basic' }, { label: 'Plus', value: 'plus' }]
                        },
                        submit: {
                            name: 'submitButton',
                            fieldType: 'button',
                            label: { value: 'Submit' }
                        }
                    }
                }
            })
        ])

        const out = await handler({ operation: 'discover' })
        const expectedFormId = Buffer.from('/content/forms/af/benefits').toString('base64url')

        expect(out.content[0].text).toContain('Benefits application: Apply for a health benefit.')
        expect(out.content[0].text).toContain(`formId: ${expectedFormId}`)
        expect(out.content[0].text).toMatch(/1\. First name \(required\).*2\. Plan type/s)
        expect(out.content[0].text).toContain('options: Basic, Plus')
        expect(global.fetch).toHaveBeenCalledTimes(2)
        expect(global.fetch.mock.calls[0][0].toString()).toBe(
            'https://publish-p206352-e2156078.adobeaemcloud.com/adobe/forms/af/listforms'
        )
        expect(global.fetch.mock.calls[1][0].toString()).toBe(
            `https://publish-p206352-e2156078.adobeaemcloud.com/adobe/forms/${expectedFormId}`
        )
        expect(global.fetch.mock.calls.every(([, options]) => !options?.headers?.authorization)).toBe(true)
    })

    test('follows list pagination cursors', async () => {
        mockFetch([
            jsonResponse({ items: [], cursor: 'page-two', limit: 2 }),
            jsonResponse({ items: [], cursor: null })
        ])

        const out = await handler({ operation: 'discover' })

        expect(out.content[0].text).toMatch(/No published Adaptive Forms/)
        const nextPageUrl = global.fetch.mock.calls[1][0]
        expect(nextPageUrl.searchParams.get('cursor')).toBe('page-two')
        expect(nextPageUrl.searchParams.get('limit')).toBe('2')
    })

    test('submits JSON answers to the headless submit endpoint', async () => {
        mockFetch([
            jsonResponse({ submissionId: 'submission-123' }, 200, { 'content-type': 'application/json' })
        ])

        const out = await handler({
            operation: 'submit',
            formId: 'L2NvbnRlbnQvZm9ybXMvYWYvYmVuZWZpdHM',
            answersJson: '{"firstName":"Ada","plan":"basic"}'
        })

        expect(out.content[0].text).toContain('Form submitted successfully')
        expect(out.content[0].text).toContain('submission-123')
        const [url, options] = global.fetch.mock.calls[0]
        expect(url.toString()).toBe(
            'https://publish-p206352-e2156078.adobeaemcloud.com/adobe/forms/af/v1/submit/L2NvbnRlbnQvZm9ybXMvYWYvYmVuZWZpdHM'
        )
        expect(options.method).toBe('POST')
        expect(options.headers.authorization).toBeUndefined()
        expect(JSON.parse(options.body)).toEqual({
            data: '{"firstName":"Ada","plan":"basic"}',
            contentType: 'application/json'
        })
    })

    test('rejects invalid answers before making a request', async () => {
        global.fetch = jest.fn()

        await expect(handler({
            operation: 'submit',
            formId: 'form-id',
            answersJson: '[]'
        })).rejects.toThrow(/JSON object/)

        expect(global.fetch).not.toHaveBeenCalled()
    })

    test('surfaces upstream HTTP failures without returning response details', async () => {
        mockFetch([
            jsonResponse({ error: 'private upstream detail' }, 401)
        ])

        await expect(handler({ operation: 'discover' }))
            .rejects.toThrow('AEM Forms request failed (HTTP 401).')
    })
})
