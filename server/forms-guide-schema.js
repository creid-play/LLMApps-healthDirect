const FORMS_GUIDE_NAME = 'aem-forms-guide'
const FORMS_CHOICE_NAME = 'aem-forms-choice'

const FORMS_GUIDE_INPUT_PROPERTIES = {
    operation: {
        type: 'string',
        enum: ['discover', 'present-choice', 'submit'],
        description: 'Use discover to list forms and their questions. Choose relevant forms, then guide the user through questions one at a time. Whenever a field has predefined choices, present them with ChatGPT’s native choice selector. Do not call or expect a widget. If the host has no native selector, list the exact options in chat and ask the user to choose one. Preserve the selected option’s exact submitted value. For free-text fields, ask in chat. Submit only after the user explicitly confirms all collected answers.'
    },
    fieldName: {
        type: 'string',
        description: 'The exact form field name for a choice question; required for present-choice.'
    },
    question: {
        type: 'string',
        description: 'The current form question to present with ChatGPT’s native choice selector; required for present-choice.'
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
        description: 'The form question to present with ChatGPT’s native choice selector.'
    },
    fieldName: {
        type: 'string',
        description: 'The exact form field name for this question.'
    },
    options: {
        type: 'array',
        description: 'All predefined answer choices from discovery, each with its exact display label and submitted value. Present them using ChatGPT’s native choice selector; if unavailable, show the exact options in chat and ask the user to choose.',
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

const FORMS_CHOICE_DESCRIPTION = 'Use this tool when presenting a form question with predefined choices. It does not render a widget. Present the question and options with ChatGPT’s native choice selector, preserving each exact label and submitted value. If the host does not provide a native selector, show the options in chat and ask the user to choose. Never invent or alter options.'
const FORMS_GUIDE_DESCRIPTION = 'When asking a form question with predefined choices, use ChatGPT’s native choice selector, not a widget. If the host has no native selector, show the exact options in chat and ask the user to choose. Preserve each exact submitted value and never invent options. Obtain explicit confirmation before submitting answers.'

function withoutWidgetMetadata (action) {
    const toolMeta = { ...action.tool_meta }
    delete toolMeta['openai/outputTemplate']
    delete toolMeta['openai/resultCanProduceWidget']
    delete toolMeta['openai/widgetAccessible']
    delete toolMeta['ui/resourceUri']

    if (toolMeta.ui) {
        const { resourceUri, ...ui } = toolMeta.ui
        if (Object.keys(ui).length) toolMeta.ui = ui
        else delete toolMeta.ui
    }

    const updatedAction = { ...action }
    if (Object.keys(toolMeta).length) updatedAction.tool_meta = toolMeta
    else delete updatedAction.tool_meta
    return updatedAction
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
            if (action?.name === FORMS_GUIDE_NAME) {
                const existingSchema = action.inputSchema || {}
                return {
                    ...withoutWidgetMetadata(action),
                    description: action.description?.includes('ChatGPT’s native choice selector')
                        ? action.description
                        : `${action.description || ''} ${FORMS_GUIDE_DESCRIPTION}`.trim(),
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
                    ...withoutWidgetMetadata(action),
                    title: action.title || 'Present form answer choices',
                    description: action.description
                        ? `${action.description} ${FORMS_CHOICE_DESCRIPTION}`
                        : FORMS_CHOICE_DESCRIPTION,
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
