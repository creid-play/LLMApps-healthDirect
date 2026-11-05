const { createMain } = require('@adobe/llm-apps-runtime')
const { ensureFormsGuideInputSchema } = require('../server/forms-guide-schema')

const path = require('path')
const ACTIONS_DIR = path.join(__dirname, '..', 'actions')

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
            }]
        })
        const moduleContext = key => require(path.join(ACTIONS_DIR, key.split('/')[1], 'index.js'))
        moduleContext.keys = () => ['./aem-forms-guide/index.js']
        const main = createMain({
            moduleContext,
            htmlContext: { keys: () => [] },
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
        expect(tool.inputSchema.required).toContain('operation')
        expect(tool.inputSchema.properties.operation.enum).toEqual(['discover', 'submit'])
        expect(tool.inputSchema.properties.formId.type).toBe('string')
        expect(tool.inputSchema.properties.answers).toBeDefined()
        expect(tool.inputSchema.properties.extraField.type).toBe('string')

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

    test('adds the forms action and schema when action metadata is empty', () => {
        const actionsConfig = ensureFormsGuideInputSchema(
            { actions: [] },
            ['aem-forms-guide', 'echo']
        )

        expect(actionsConfig.actions.map(action => action.name)).toEqual([
            'aem-forms-guide',
            'echo'
        ])
        expect(actionsConfig.actions[0].inputSchema.required).toContain('operation')
        expect(actionsConfig.actions[0].inputSchema.properties.operation.enum).toEqual([
            'discover',
            'submit'
        ])
    })
})
