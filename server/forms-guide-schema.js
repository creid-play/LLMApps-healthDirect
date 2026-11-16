const FORMS_GUIDE_NAME = 'aem-forms-guide'
const FORMS_CHOICE_NAME = 'aem-forms-choice'

const FORMS_GUIDE_INPUT_PROPERTIES = {
    operation: {
        type: 'string',
        enum: ['discover', 'present-choice', 'submit'],
        description: 'Use discover to list forms and their questions. Choose relevant forms, then guide the user through questions one at a time. For predefined choices, show only exact display labels in ChatGPT’s native choice selector, never the underlying data values. Keep the label-to-value mapping internal and map the selected display label back to its exact data value for form submission. Do not call or expect a widget. If the host has no native selector, show only the display labels in chat. Submit only after the user explicitly confirms all collected answers.'
    },
    fieldName: {
        type: 'string',
        description: 'The exact form field name for a choice question; required for present-choice.'
    },
    question: {
        type: 'string',
        description: 'The form question to present with ChatGPT’s native choice selector; show only the display labels to the user and map their selection back to its data value.'
    },
    options: {
        type: 'array',
        description: 'All predefined answer choices, each with its exact display label and submitted value. Present only labels to the user and use the exact corresponding value in form answers.',
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
        description: 'The form question to present with ChatGPT’s native choice selector; show only the display labels to the user.'
    },
    fieldName: {
        type: 'string',
        description: 'The exact form field name for this question.'
    },
    options: {
        type: 'array',
        description: 'All predefined answer choices from discovery. Show only each exact label in the native choice selector, never the data value. Map the selected label back to its exact value for submission.',
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

const FORMS_CHOICE_DESCRIPTION = 'Use this tool to present one predefined-choice form question. It returns plain-text instructions and does not render a widget. Show only exact option labels with ChatGPT’s native choice selector; never show the underlying data values. Keep the label-to-value mapping internal and map the selected label back to its exact value for form submission. If the host has no native selector, show only the labels in chat and ask the user to choose. Never invent or alter options.'
const FORMS_GUIDE_DESCRIPTION = 'Use discover to list forms and questions, then select and guide the user through relevant forms one question at a time. For predefined choices, show only exact display labels with ChatGPT’s native choice selector, never data values. Keep the label-to-value mapping internal and map the selected label back to its exact value for submission. Do not call or expect a widget; if the host has no native selector, ask the user to choose from the labels in chat. Ask free-text questions in chat. Summarize all answers and obtain explicit confirmation before submit.'

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
                    description: FORMS_GUIDE_DESCRIPTION,
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
                    description: FORMS_CHOICE_DESCRIPTION,
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
