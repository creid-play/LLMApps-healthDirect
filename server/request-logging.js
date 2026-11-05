function requestDetails (params) {
    let requestBody
    try {
        requestBody = typeof params.__ow_body === 'string'
            ? JSON.parse(params.__ow_body)
            : params.__ow_body
    } catch {
        requestBody = null
    }

    const details = {
        httpMethod: params.__ow_method || null,
        mcpMethod: typeof requestBody?.method === 'string' ? requestBody.method : null
    }

    if (requestBody?.method === 'tools/call') {
        const toolArguments = requestBody.params?.arguments
        details.toolName = typeof requestBody.params?.name === 'string'
            ? requestBody.params.name
            : null
        details.operation = typeof toolArguments?.operation === 'string'
            ? toolArguments.operation
            : null
        details.argumentKeys = toolArguments && typeof toolArguments === 'object' &&
            !Array.isArray(toolArguments)
            ? Object.keys(toolArguments).sort()
            : []
    }

    return details
}

function withRequestLogging (main, logger = console) {
    if (typeof main !== 'function') {
        throw new TypeError('withRequestLogging requires a main handler function.')
    }

    return async function loggedMain (params) {
        const details = requestDetails(params || {})
        const startedAt = Date.now()
        logger.log('[mcp] request received', JSON.stringify(details))

        try {
            const result = await main(params)
            logger.log('[mcp] request completed', JSON.stringify({
                ...details,
                statusCode: result?.statusCode ?? 200,
                durationMs: Date.now() - startedAt
            }))
            return result
        } catch (error) {
            logger.error('[mcp] request failed', JSON.stringify({
                ...details,
                errorName: error?.name || 'Error',
                durationMs: Date.now() - startedAt
            }))
            throw error
        }
    }
}

module.exports = { withRequestLogging }
