const FORMS_GUIDE_NAME = 'aem-forms-guide'

const FORMS_GUIDE_INPUT_PROPERTIES = {
    operation: {
        type: 'string',
        enum: ['discover', 'present-choice', 'submit'],
        description: 'Use discover to find relevant forms and guide the user through questions one at a time. For a question with predefined choices, call present-choice with its fieldName, question, and exact options to show the choices in the attached widget. Use submit only after the user explicitly confirms all answers.'
    },
    fieldName: {
        type: 'string',
        description: 'The exact field name for the multiple-choice question; required for present-choice.'
    },
    question: {
        type: 'string',
        description: 'The question text to show above the choices; required for present-choice.'
    },
    options: {
        type: 'array',
        description: 'The predefined choices from form discovery; pass each as an object with its display label and exact submitted value. Required for present-choice.',
        items: {
            type: 'object',
            properties: {
                label: { type: 'string' },
                value: { type: 'string' }
            },
            required: ['label', 'value']
        }
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
