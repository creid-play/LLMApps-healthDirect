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

function returnedSubmissionRequest (out) {
    const marker = 'Request sent to AEM Forms:\n'
    return JSON.parse(out.content[0].text.split(marker)[1])
}

describe('aem-forms-guide handler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        delete global.fetch
    })

    test('does not silently list forms when the operation and arguments are missing', async () => {
        global.fetch = jest.fn()

        await expect(handler({})).rejects.toThrow(
            'operation is required; use "discover" to list forms or "submit" to submit answers.'
        )
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
        expect(returnedSubmissionRequest(out)).toEqual({
            method: 'POST',
            url: 'https://publish-p206352-e2156078.adobeaemcloud.com/adobe/forms/af/submit/L2NvbnRlbnQvZm9ybXMvYWYvYmVuZWZpdHM',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                data: '{"firstName":"Ada","plan":"basic"}',
                contentType: 'application/json'
            })
        })
        const [url, options] = global.fetch.mock.calls[0]
        expect(url.toString()).toBe(
            'https://publish-p206352-e2156078.adobeaemcloud.com/adobe/forms/af/submit/L2NvbnRlbnQvZm9ybXMvYWYvYmVuZWZpdHM'
        )
        expect(options.method).toBe('POST')
        expect(options.redirect).toBe('manual')
        expect(options.headers.authorization).toBeUndefined()
        expect(JSON.parse(options.body)).toEqual({
            data: '{"firstName":"Ada","plan":"basic"}',
            contentType: 'application/json'
        })
        expect(out.content[0].text).toContain('Request sent to AEM Forms:')
        expect(out.content[0].text).toContain('"url": "https://publish-p206352-e2156078.adobeaemcloud.com/adobe/forms/af/submit/L2NvbnRlbnQvZm9ybXMvYWYvYmVuZWZpdHM"')
        expect(out.content[0].text).toContain('"body": "{\\"data\\":\\"{\\\\\\"firstName\\\\\\":\\\\\\"Ada\\\\\\",\\\\\\"plan\\\\\\":\\\\\\"basic\\\\\\"}\\",\\"contentType\\":\\"application/json\\"}"')
    })

    test('submits the operation/formId/answers object payload', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
        mockFetch([
            jsonResponse({ submissionId: 'submission-789' }, 200, { 'content-type': 'application/json' })
        ])

        const out = await handler({
            operation: 'submit',
            formId: 'L2NvbnRlbnQvZm9ybXMvYWYvaGVhZGxlc3MtdGVzdC1mb3Jt',
            answers: {
                textinput1791947329104: 'Chris',
                textinput_16563193791791947332582: 'Reid'
            }
        })

        expect(out.content[0].text).toContain('Form submitted successfully')
        expect(out.content[0].text).toContain('submission-789')
        expect(global.fetch).toHaveBeenCalledTimes(1)
        const [url, options] = global.fetch.mock.calls[0]
        expect(url.toString()).toBe(
            'https://publish-p206352-e2156078.adobeaemcloud.com/adobe/forms/af/submit/L2NvbnRlbnQvZm9ybXMvYWYvaGVhZGxlc3MtdGVzdC1mb3Jt'
        )
        expect(options.method).toBe('POST')
        expect(options.redirect).toBe('manual')
        expect(JSON.parse(options.body)).toEqual({
            data: '{"textinput1791947329104":"Chris","textinput_16563193791791947332582":"Reid"}',
            contentType: 'application/json'
        })
        expect(logSpy).toHaveBeenCalledWith(
            '[aem-forms-guide] dispatch selected',
            JSON.stringify({
                requestedOperation: 'submit',
                selectedOperation: 'submit',
                argumentKeys: ['answers', 'formId', 'operation']
            })
        )
        expect(logSpy.mock.calls.flat().join(' ')).not.toContain('Chris')
        expect(logSpy.mock.calls.flat().join(' ')).not.toContain('Reid')
    })

    test('infers submit when submission arguments are provided without an operation', async () => {
        mockFetch([
            jsonResponse({ submissionId: 'submission-456' }, 200, { 'content-type': 'application/json' })
        ])

        const out = await handler({
            formId: 'L2NvbnRlbnQvZm9ybXMvYWYvYmVuZWZpdHM',
            answersJson: '{"firstName":"Chris","lastName":"Reid"}'
        })

        expect(out.content[0].text).toContain('Form submitted successfully')
        expect(out.content[0].text).toContain('submission-456')
        expect(global.fetch).toHaveBeenCalledTimes(1)
        const [url, options] = global.fetch.mock.calls[0]
        expect(url.toString()).toContain('/adobe/forms/af/submit/')
        expect(JSON.parse(options.body)).toEqual({
            data: '{"firstName":"Chris","lastName":"Reid"}',
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
            jsonResponse({ error: 'private upstream detail' }, 405, { allow: 'GET, OPTIONS' })
        ])

        await expect(handler({ operation: 'discover' }))
            .rejects.toThrow('AEM Forms request failed (HTTP 405).')
    })

    test('returns the full submission request with method-not-allowed details', async () => {
        mockFetch([
            jsonResponse({ error: 'private upstream detail' }, 405, { allow: 'GET, OPTIONS' })
        ])

        const out = await handler({
            operation: 'submit',
            formId: 'form-id',
            answers: { firstName: 'Ada' }
        })

        expect(out.isError).toBe(true)
        expect(out.content[0].text).toContain(
            'AEM Forms submission failed (HTTP 405); endpoint allows: GET, OPTIONS.'
        )
        expect(returnedSubmissionRequest(out)).toEqual({
            method: 'POST',
            url: 'https://publish-p206352-e2156078.adobeaemcloud.com/adobe/forms/af/submit/form-id',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                data: '{"firstName":"Ada"}',
                contentType: 'application/json'
            })
        })
    })

    test('returns the full submission request when the endpoint redirects', async () => {
        mockFetch([
            jsonResponse({}, 302, { location: '/adobe/forms/af/submit/canonical-id' })
        ])

        const out = await handler({
            operation: 'submit',
            formId: 'form-id',
            answers: { firstName: 'Ada' }
        })

        expect(out.isError).toBe(true)
        expect(out.content[0].text).toMatch(/redirected the POST request \(HTTP 302\)/)
        expect(returnedSubmissionRequest(out).method).toBe('POST')
        expect(returnedSubmissionRequest(out).body).toContain('firstName')
    })

    test('returns the full submission request when fetch fails', async () => {
        global.fetch = jest.fn().mockRejectedValue(new TypeError('network unavailable'))

        const out = await handler({
            operation: 'submit',
            formId: 'form-id',
            answers: { firstName: 'Ada' }
        })

        expect(out.isError).toBe(true)
        expect(out.content[0].text).toContain('network unavailable')
        expect(returnedSubmissionRequest(out).method).toBe('POST')
        expect(returnedSubmissionRequest(out).body).toContain('firstName')
    })

    test('returns the full submission request when the success response cannot be parsed', async () => {
        mockFetch([{
            ...jsonResponse({}, 200, { 'content-type': 'application/json' }),
            json: jest.fn().mockRejectedValue(new SyntaxError('invalid JSON'))
        }])

        const out = await handler({
            operation: 'submit',
            formId: 'form-id',
            answers: { firstName: 'Ada' }
        })

        expect(out.isError).toBe(true)
        expect(out.content[0].text).toContain('JSON response could not be parsed')
        expect(returnedSubmissionRequest(out).body).toContain('firstName')
    })
})
