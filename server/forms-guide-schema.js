const FORMS_GUIDE_NAME = 'aem-forms-guide'

const FORMS_GUIDE_INPUT_PROPERTIES = {
    operation: {
        type: 'string',
        enum: ['discover', 'present-choice', 'submit'],
        description: 'MANDATORY: When guiding the user through a form, ask questions one at a time. Whenever the current field is a dropdown, select, radio group, or any question with predefined options, you MUST call aem-forms-guide with operation "present-choice", fieldName, the question text, and every exact label/value option from discovery. The result has structuredContent.type "choice" and is mapped to the attached choice widget; let that widget render for the user. Do not answer with prose instead of the widget, present these options as a text list, ask the user to type an option, skip the widget, or move to the next question until the user clicks a choice. Record the clicked option’s exact value and continue. For free-text fields, ask in chat. First use discover to choose relevant forms; submit only after the user explicitly confirms all collected answers.'
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
                tool_meta: {
                    ...action.tool_meta,
                    ui: {
                        visibility: ['model', 'app'],
                        ...action.tool_meta?.ui
                    },
                    'openai/widgetAccessible': true
                },
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
