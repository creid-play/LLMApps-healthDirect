const FORMS_GUIDE_NAME = 'aem-forms-guide'

const FORMS_GUIDE_INPUT_PROPERTIES = {
    operation: {
        type: 'string',
        enum: ['discover', 'submit'],
        description: 'Use discover to list forms or submit to send user-confirmed answers.'
    },
    formId: {
        type: 'string',
        description: 'The formId returned by discover; required when operation is submit.'
    },
    answers: {
        type: 'object',
        description: 'Completed answers keyed by form field name; required when operation is submit.'
    },
    answersJson: {
        type: 'string',
        description: 'Legacy JSON-string form of answers.'
    }
}

function ensureFormsGuideInputSchema (actionsConfig, availableActionNames = []) {
    const configuredActions = Array.isArray(actionsConfig?.actions)
        ? actionsConfig.actions
        : []
    const actions = configuredActions.length
        ? configuredActions
        : availableActionNames.map(name => ({ name }))

    return {
        ...actionsConfig,
        actions: actions.map(action => {
            if (action?.name !== FORMS_GUIDE_NAME) return action

            const existingSchema = action.inputSchema || {}
            return {
                ...action,
                inputSchema: {
                    ...existingSchema,
                    type: 'object',
                    properties: {
                        ...existingSchema.properties,
                        ...FORMS_GUIDE_INPUT_PROPERTIES
                    },
                    required: [...new Set([...(existingSchema.required || []), 'operation'])]
                }
            }
        })
    }
}

module.exports = { ensureFormsGuideInputSchema }
