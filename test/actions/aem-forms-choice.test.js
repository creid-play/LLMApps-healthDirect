const handler = require('../../actions/aem-forms-choice/index.js')

describe('aem-forms-choice handler', () => {
    test('returns native selector instructions and exact choices as plain text', async () => {
        const out = await handler({
            fieldName: 'owner_citizenship_status',
            question: 'What is your citizenship status?',
            options: [
                { label: 'Australian citizen', value: 'citizen' },
                { label: 'Permanent resident', value: 'permanent_resident' },
                { label: 'Other', value: 'other' }
            ]
        })

        expect(out.structuredContent).toBeUndefined()
        expect(out.content[0].text).toContain("ChatGPT's native choice selector, not a widget")
        expect(out.content[0].text).toContain('What is your citizenship status? (field: owner_citizenship_status)')
        expect(out.content[0].text).toContain('Australian citizen (value: citizen)')
        expect(out.content[0].text).toContain('Permanent resident (value: permanent_resident)')
        expect(out.content[0].text).toContain('Other (value: other)')
    })

    test.each([
        [{ fieldName: 'status', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] }, 'question is required'],
        [{ question: 'Status?', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] }, 'fieldName is required'],
        [{ question: 'Status?', fieldName: 'status', options: [{ label: 'Yes', value: 'yes' }] }, 'at least two choices'],
        [{ question: 'Status?', fieldName: 'status', options: [{ label: 'Yes', value: '' }, { label: 'No', value: 'no' }] }, 'options[0]']
    ])('validates choice request %j', async (args, message) => {
        await expect(handler(args)).rejects.toThrow(message)
    })
})
