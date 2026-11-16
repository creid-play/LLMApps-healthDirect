function textResult (text) {
    return { content: [{ type: 'text', text }] }
}

module.exports = async (args = {}) => {
    if (typeof args.question !== 'string' || !args.question.trim()) {
        throw new Error('question is required.')
    }
    if (typeof args.fieldName !== 'string' || !args.fieldName.trim()) {
        throw new Error('fieldName is required.')
    }
    if (!Array.isArray(args.options) || args.options.length < 2) {
        throw new Error('options must contain at least two choices.')
    }

    const options = args.options.map((option, index) => {
        if (!option || typeof option.label !== 'string' || !option.label.trim() ||
            typeof option.value !== 'string' || !option.value.trim()) {
            throw new Error(`options[${index}] must include non-empty string label and value properties.`)
        }
        return { label: option.label, value: option.value }
    })
    const question = args.question.trim()
    const fieldName = args.fieldName.trim()
    const displayChoices = options.map(option => `- ${option.label}`).join('\n')
    const submissionMapping = options
        .map(option => `- ${JSON.stringify(option.label)} => ${JSON.stringify(option.value)}`)
        .join('\n')

    return textResult(
        `Present this form question with ChatGPT's native choice selector, not a widget. ` +
        'Use ONLY the display text in the "Choices to show the user" list as selector options; ' +
        'never show data values or the internal mapping to the user. When the user selects a label, ' +
        'look up its exact data value in the internal mapping and use that value in the form answers. ' +
        'If a native selector is unavailable, show the options in chat and ask the user to choose. ' +
        'Do not select an answer for the user.\n' +
        `Question: ${question}\nField: ${fieldName}\n` +
        `Choices to show the user:\n${displayChoices}\n` +
        `Internal submission mapping (never display):\n${submissionMapping}`
    )
}
