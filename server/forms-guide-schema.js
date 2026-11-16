const FORMS_GUIDE_NAME = 'aem-forms-guide'
const FORMS_CHOICE_NAME = 'aem-forms-choice'

const FORMS_GUIDE_INPUT_PROPERTIES = {
    operation: {
        type: 'string',
        enum: ['discover', 'present-choice', 'submit'],
        description: 'Use discover to list forms and their questions. Choose relevant forms, then guide the user through questions one at a time. Whenever a field has predefined choices, call aem-forms-choice to render the choice widget. For compatibility, present-choice is also accepted here and renders the same widget. Do not show choices as prose or ask the user to type one. Continue with the selected value. For free-text fields, ask in chat. Submit only after the user explicitly confirms all collected answers.'
    },
    fieldName: {
        type: 'string',
        description: 'The exact form field name for a choice question; required for present-choice.'
    },
    question: {
        type: 'string',
        description: 'The current form question to show in the choice widget; required for present-choice.'
    },
    options: {
        type: 'array',
        description: 'All predefined answer choices, each with its exact display label and submitted value; required for present-choice.',
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

const FORMS_CHOICE_INPUT_PROPERTIES = {
    question: {
        type: 'string',
        description: 'The current form question to show in the widget.'
    },
    fieldName: {
        type: 'string',
        description: 'The exact form field name for this question.'
    },
    options: {
        type: 'array',
        description: 'All predefined answer choices from discovery, each with its exact display label and submitted value.',
        items: {
            type: 'object',
            properties: {
                label: { type: 'string' },
                value: { type: 'string' }
            },
            required: ['label', 'value']
        }
    }
}

const FORMS_CHOICE_DESCRIPTION = 'MANDATORY render tool: Call this after aem-forms-guide discovers a form question with predefined options. Pass the current question, exact fieldName, and every option’s display label and submitted value. This tool renders those options as clickable buttons; wait for the user to choose one and continue using its exact value. Do not list the choices in prose or ask the user to type an answer.'

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
            if (action?.name === FORMS_GUIDE_NAME) {
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
            }

            if (action?.name === FORMS_CHOICE_NAME) {
                const existingSchema = action.inputSchema || {}
                return {
                    ...action,
                    title: action.title || 'Show form answer choices',
                    description: action.description
                        ? `${action.description} ${FORMS_CHOICE_DESCRIPTION}`
                        : FORMS_CHOICE_DESCRIPTION,
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
                            ...FORMS_CHOICE_INPUT_PROPERTIES
                        },
                        required: [...new Set([
                            ...(existingSchema.required || []),
                            'question',
                            'fieldName',
                            'options'
                        ])]
                    }
                }
            }

            return action
        })
    }
}

module.exports = { ensureFormsGuideInputSchema }
