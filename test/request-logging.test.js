const { withRequestLogging } = require('../server/request-logging')

describe('MCP request logging', () => {
    test('logs request and completion metadata without argument values', async () => {
        const logger = {
            log: jest.fn(),
            error: jest.fn()
        }
        const main = jest.fn().mockResolvedValue({
            statusCode: 200,
            body: '{"result":{"content":[{"type":"text","text":"private response"}]}}'
        })
        const loggedMain = withRequestLogging(main, logger)
        const params = {
            __ow_method: 'post',
            __ow_body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'aem-forms-guide',
                    arguments: {
                        operation: 'submit',
                        formId: 'private-form-id',
                        answers: { firstName: 'Private answer' }
                    }
                }
            })
        }

        const result = await loggedMain(params)

        expect(result).toBe(await main.mock.results[0].value)
        expect(logger.log).toHaveBeenNthCalledWith(
            1,
            '[mcp] request received',
            JSON.stringify({
                httpMethod: 'post',
                mcpMethod: 'tools/call',
                toolName: 'aem-forms-guide',
                operation: 'submit',
                argumentKeys: ['answers', 'formId', 'operation']
            })
        )
        expect(logger.log).toHaveBeenNthCalledWith(
            2,
            '[mcp] request completed',
            expect.stringContaining('"statusCode":200')
        )
        const serializedLogs = JSON.stringify([logger.log.mock.calls, logger.error.mock.calls])
        expect(serializedLogs).not.toContain('private-form-id')
        expect(serializedLogs).not.toContain('Private answer')
        expect(serializedLogs).not.toContain('private response')
    })

    test('logs thrown failures and rethrows them', async () => {
        const error = new Error('request failed')
        const logger = {
            log: jest.fn(),
            error: jest.fn()
        }
        const loggedMain = withRequestLogging(jest.fn().mockRejectedValue(error), logger)

        await expect(loggedMain({ __ow_method: 'post', __ow_body: '{invalid' })).rejects.toBe(error)

        expect(logger.error).toHaveBeenCalledWith(
            '[mcp] request failed',
            expect.stringContaining('"errorName":"Error"')
        )
    })
})
