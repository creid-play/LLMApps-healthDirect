const { createMain } = require('@adobe/llm-apps-runtime')
const { ensureFormsGuideInputSchema } = require('../server/forms-guide-schema')
const fs = require('fs')

const path = require('path')
const ACTIONS_DIR = path.join(__dirname, '..', 'actions')
const CHOICE_WIDGET_PATH = path.join(ACTIONS_DIR, 'aem-forms-choice', 'widget.html')

function widgetContext () {
    const widgetHtml = fs.readFileSync(CHOICE_WIDGET_PATH, 'utf8')
    const context = () => widgetHtml
    context.keys = () => ['./aem-forms-choice/widget.html']
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
                inputSchema: {
                    type: 'object',
                    properties: {
                        extraField: { type: 'string' }
                    }
                }
            }, {
                name: 'aem-forms-choice'
            }]
        })
        const moduleContext = key => require(path.join(ACTIONS_DIR, key.split('/')[1], 'index.js'))
        moduleContext.keys = () => ['./aem-forms-guide/index.js', './aem-forms-choice/index.js']
        const main = createMain({
            moduleContext,
            htmlContext: widgetContext(),
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
        expect(tool.inputSchema.properties.operation.enum).toEqual(['discover', 'submit'])
        expect(tool.inputSchema.properties.operation.description).toContain('you MUST call aem-forms-choice')
        expect(tool.inputSchema.properties.operation.description).toContain('explicitly confirms')
        expect(tool.inputSchema.properties.formId.type).toBe('string')
        expect(tool.inputSchema.properties.answers).toBeDefined()
        expect(tool.inputSchema.properties.extraField.type).toBe('string')
        expect(tool._meta?.ui?.resourceUri).toBeUndefined()
        expect(choiceTool._meta['openai/outputTemplate']).toBe('ui://aem-forms-choice/widget.html')
        expect(choiceTool._meta['openai/resultCanProduceWidget']).toBe(true)
        expect(choiceTool._meta['openai/widgetAccessible']).toBe(true)
        expect(choiceTool._meta.ui.resourceUri).toBe('ui://aem-forms-choice/widget.html')
        expect(choiceTool._meta.ui.visibility).toEqual(['model', 'app'])
        expect(choiceTool.inputSchema.properties.question.type).toBe('string')
        expect(choiceTool.inputSchema.properties.fieldName.type).toBe('string')
        expect(choiceTool.inputSchema.properties.options.type).toBe('array')
        expect(choiceTool.inputSchema.required).toEqual(['question', 'fieldName', 'options'])

        const resourceList = await mcpPost(main, {
            jsonrpc: '2.0',
            id: 4,
            method: 'resources/list',
            params: {}
        })
        expect(JSON.parse(resourceList.body).result.resources).toContainEqual(
            expect.objectContaining({ uri: 'ui://aem-forms-choice/widget.html' })
        )

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

    test('renders one question through the dedicated choice tool', async () => {
        const actionsConfig = ensureFormsGuideInputSchema({
            actions: [{ name: 'aem-forms-choice' }]
        })
        const moduleContext = key => require(path.join(ACTIONS_DIR, key.split('/')[1], 'index.js'))
        moduleContext.keys = () => ['./aem-forms-choice/index.js']
        const main = createMain({
            moduleContext,
            htmlContext: widgetContext(),
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

        expect(JSON.parse(called.body).result.structuredContent).toEqual({
            type: 'choice',
            fieldName: 'accountType',
            question: 'What type of account do you need?',
            options: [
                { label: 'Business', value: 'business' },
                { label: 'Personal', value: 'personal' }
            ]
        })

        const resource = await mcpPost(main, {
            jsonrpc: '2.0',
            id: 5,
            method: 'resources/read',
            params: { uri: 'ui://aem-forms-choice/widget.html' }
        })
        const widget = JSON.parse(resource.body).result.contents[0].text
        expect(widget).toContain('output?.type !== \'choice\'')
        expect(widget).toContain('window.openai.toolOutput')
        expect(widget).toContain('sendFollowUpMessage')
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
            'submit'
        ])
        expect(actionsConfig.actions[1].inputSchema.required).toEqual([
            'question',
            'fieldName',
            'options'
        ])
    })
})
