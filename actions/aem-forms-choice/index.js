function textResult (text, structuredContent) {
    return {
        content: [{ type: 'text', text }],
        structuredContent
    }
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
    const choices = options.map(option => `- ${option.label} (value: ${option.value})`).join('\n')

    return textResult(
        `Render the following single form question with the attached choice widget. Wait for the user to click an answer; do not ask them to type an option.\n${question}\n${choices}`,
        { type: 'choice', fieldName, question, options }
    )
}
