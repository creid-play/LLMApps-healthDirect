const { createMain } = require('@adobe/llm-apps-runtime')
const { ensureFormsGuideInputSchema } = require('../server/forms-guide-schema')

const path = require('path')
const ACTIONS_DIR = path.join(__dirname, '..', 'actions')

function emptyHtmlContext () {
    const context = () => undefined
    context.keys = () => []
    return context
}

function mcpPost (main, body) {
    return main({
        __ow_method: 'post',
        __ow_body: JSON.stringify(body),
        __ow_headers: {
            'content-type': 'application/json',
            accept: 'application/json;q=1.0, text/event-stream;q=0.5'
        },
        LOG_LEVEL: 'error'
    })
}

describe('AEM Forms guide MCP registration', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        delete global.fetch
    })

    test('registers the submission schema and forwards the exact MCP payload to submit', async () => {
        const actionsConfig = ensureFormsGuideInputSchema({
            actions: [{
                name: 'aem-forms-guide',
                title: 'AEM Forms Guide',
                tool_meta: {
                    ui: { resourceUri: 'ui://aem-forms-guide/widget.html', visibility: ['model', 'app'] },
                    'ui/resourceUri': 'ui://aem-forms-guide/widget.html',
                    'openai/outputTemplate': 'ui://aem-forms-guide/widget.html',
                    'openai/resultCanProduceWidget': true,
                    'openai/widgetAccessible': true
                },
                inputSchema: {
                    type: 'object',
                    properties: {
                        extraField: { type: 'string' }
                    }
                }
            }, {
                name: 'aem-forms-choice',
                tool_meta: {
                    ui: { resourceUri: 'ui://aem-forms-choice/widget.html' },
                    'openai/outputTemplate': 'ui://aem-forms-choice/widget.html',
                    'openai/resultCanProduceWidget': true,
                    'openai/widgetAccessible': true
                }
            }]
        })
        const moduleContext = key => require(path.join(ACTIONS_DIR, key.split('/')[1], 'index.js'))
        moduleContext.keys = () => ['./aem-forms-guide/index.js', './aem-forms-choice/index.js']
        const main = createMain({
            moduleContext,
            htmlContext: emptyHtmlContext(),
            actionsConfig,
            serverName: 'forms-guide-registration-test'
        }).main
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: jest.fn().mockResolvedValue({ submissionId: 'test-submission' })
        })

        const listed = await mcpPost(main, {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        })
        const tool = JSON.parse(listed.body).result.tools.find(item => item.name === 'aem-forms-guide')
        const choiceTool = JSON.parse(listed.body).result.tools.find(item => item.name === 'aem-forms-choice')
        expect(tool.inputSchema.required).toContain('operation')
        expect(tool.inputSchema.properties.operation.enum).toEqual(['discover', 'present-choice', 'submit'])
        expect(tool.inputSchema.properties.operation.description).toContain("ChatGPT’s native choice selector")
        expect(tool.inputSchema.properties.operation.description).toContain('explicitly confirms')
        expect(tool.inputSchema.properties.formId.type).toBe('string')
        expect(tool.inputSchema.properties.answers).toBeDefined()
        expect(tool.inputSchema.properties.extraField.type).toBe('string')
        expect(tool.description).toContain('ChatGPT’s native choice selector')
        expect(tool._meta?.['openai/outputTemplate']).toBeUndefined()
        expect(tool._meta?.['openai/resultCanProduceWidget']).toBeUndefined()
        expect(tool._meta?.['openai/widgetAccessible']).toBeUndefined()
        expect(tool._meta?.ui?.resourceUri).toBeUndefined()
        expect(tool._meta?.['ui/resourceUri']).toBeUndefined()
        expect(tool.inputSchema.properties.question.type).toBe('string')
        expect(tool.inputSchema.properties.options.type).toBe('array')
        expect(choiceTool.description).toContain('native choice selector')
        expect(choiceTool.description).toContain('not render a widget')
        expect(choiceTool._meta?.['openai/outputTemplate']).toBeUndefined()
        expect(choiceTool._meta?.['openai/resultCanProduceWidget']).toBeUndefined()
        expect(choiceTool._meta?.['openai/widgetAccessible']).toBeUndefined()
        expect(choiceTool._meta?.ui?.resourceUri).toBeUndefined()
        expect(choiceTool.inputSchema.properties.question.type).toBe('string')
        expect(choiceTool.inputSchema.properties.fieldName.type).toBe('string')
        expect(choiceTool.inputSchema.properties.options.type).toBe('array')
        expect(choiceTool.inputSchema.required).toEqual(['question', 'fieldName', 'options'])

        const called = await mcpPost(main, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'aem-forms-guide',
                arguments: {
                    operation: 'submit',
                    formId: 'L2NvbnRlbnQvZm9ybXMvYWYvaGVhZGxlc3MtdGVzdC1mb3Jt',
                    answers: {
                        textinput1791947329104: 'Chris',
                        textinput_16563193791791947332582: 'Reid'
                    }
                }
            }
        })

        const result = JSON.parse(called.body).result
        expect(result.content[0].text).toContain('Form submitted successfully')
        expect(global.fetch).toHaveBeenCalledTimes(1)
        const [url, options] = global.fetch.mock.calls[0]
        expect(url.toString()).toContain('/adobe/forms/af/submit/')
        expect(options.method).toBe('POST')
        expect(JSON.parse(options.body)).toEqual({
            data: {
                textinput1791947329104: 'Chris',
                textinput_16563193791791947332582: 'Reid'
            },
            submitMetadata: {}
        })
    })

    test('returns native selector instructions for one question without a widget payload', async () => {
        const actionsConfig = ensureFormsGuideInputSchema({
            actions: [{ name: 'aem-forms-choice' }]
        })
        const moduleContext = key => require(path.join(ACTIONS_DIR, key.split('/')[1], 'index.js'))
        moduleContext.keys = () => ['./aem-forms-choice/index.js']
        const main = createMain({
            moduleContext,
            htmlContext: emptyHtmlContext(),
            actionsConfig,
            serverName: 'forms-guide-choice-test'
        }).main

        const called = await mcpPost(main, {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
                name: 'aem-forms-choice',
                arguments: {
                    fieldName: 'accountType',
                    question: 'What type of account do you need?',
                    options: [
                        { label: 'Business', value: 'business' },
                        { label: 'Personal', value: 'personal' }
                    ]
                }
            }
        })

        const result = JSON.parse(called.body).result
        expect(result.structuredContent).toBeUndefined()
        expect(result.content[0].text).toContain("ChatGPT's native choice selector, not a widget")
        expect(result.content[0].text).toContain('Business (value: business)')
        expect(result.content[0].text).toContain('Personal (value: personal)')
    })

    test('accepts present-choice on aem-forms-guide and returns plain text instructions', async () => {
        const actionsConfig = ensureFormsGuideInputSchema({
            actions: [{ name: 'aem-forms-guide' }]
        })
        const moduleContext = key => require(path.join(ACTIONS_DIR, key.split('/')[1], 'index.js'))
        moduleContext.keys = () => ['./aem-forms-guide/index.js']
        const main = createMain({
            moduleContext,
            htmlContext: emptyHtmlContext(),
            actionsConfig,
            serverName: 'forms-guide-compat-choice-test'
        }).main

        const called = await mcpPost(main, {
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: {
                name: 'aem-forms-guide',
                arguments: {
                    operation: 'present-choice',
                    fieldName: 'owner_citizenship_status',
                    question: 'What is your citizenship status?',
                    options: [
                        { label: 'Australian citizen', value: 'citizen' },
                        { label: 'Permanent resident', value: 'permanent_resident' },
                        { label: 'Other', value: 'other' }
                    ]
                }
            }
        })
        const result = JSON.parse(called.body).result
        expect(result.structuredContent).toBeUndefined()
        expect(result.content[0].text).toContain("ChatGPT's native choice selector")
        expect(result.content[0].text).toContain('Australian citizen (value: citizen)')
        expect(result.content[0].text).toContain('Permanent resident (value: permanent_resident)')
        expect(result.content[0].text).toContain('Other (value: other)')
    })

    test('adds the forms action and schema when action metadata is empty', () => {
        const actionsConfig = ensureFormsGuideInputSchema(
            { actions: [] },
            ['aem-forms-guide', 'aem-forms-choice', 'echo']
        )

        expect(actionsConfig.actions.map(action => action.name)).toEqual([
            'aem-forms-guide',
            'aem-forms-choice',
            'echo'
        ])
        expect(actionsConfig.actions[0].inputSchema.required).toContain('operation')
        expect(actionsConfig.actions[0].inputSchema.properties.operation.enum).toEqual([
            'discover',
            'present-choice',
            'submit'
        ])
        expect(actionsConfig.actions[0].inputSchema.properties.options.type).toBe('array')
        expect(actionsConfig.actions[1].inputSchema.required).toEqual([
            'question',
            'fieldName',
            'options'
        ])
        expect(actionsConfig.actions[0].tool_meta).toBeUndefined()
        expect(actionsConfig.actions[1].tool_meta).toBeUndefined()
    })
})
