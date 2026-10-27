/**
 * Discovers published AEM Forms and submits completed headless forms.
 *
 * The published Forms API is accessed anonymously. AEM_FORMS_BASE_URL can
 * override the default publish host for another environment.
 */

const DEFAULT_AEM_FORMS_BASE_URL = 'https://publish-p206352-e2156078.adobeaemcloud.com'
const LIST_FORMS_PATH = '/adobe/forms/af/listforms'

function textResult (text) {
    return { content: [{ type: 'text', text }] }
}

function readVariables (extra) {
    const variables = extra?.variables || {}
    return {
        baseUrl: variables.AEM_FORMS_BASE_URL || DEFAULT_AEM_FORMS_BASE_URL
    }
}

function validateBaseUrl (baseUrl) {
    let parsed
    try {
        parsed = new URL(baseUrl)
    } catch {
        throw new Error('AEM_FORMS_BASE_URL must be a valid HTTPS AEM Cloud Service URL.')
    }

    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.adobeaemcloud.com')) {
        throw new Error('AEM_FORMS_BASE_URL must use an HTTPS *.adobeaemcloud.com host.')
    }

    return parsed.origin
}

async function requestJson (url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            accept: 'application/json',
            ...options.headers
        }
    })

    if (!response.ok) {
        throw new Error(`AEM Forms request failed (HTTP ${response.status}).`)
    }

    return response.json()
}

function listItems (result) {
    if (Array.isArray(result)) return result
    if (Array.isArray(result?.items)) return result.items
    if (Array.isArray(result?.forms)) return result.forms
    if (Array.isArray(result?.results)) return result.results
    throw new Error('AEM Forms list response did not contain a forms array.')
}

function formIdFor (form) {
    const directId = form?.formId || form?.id
    if (typeof directId === 'string' && directId) {
        return directId.startsWith('/')
            ? Buffer.from(directId, 'utf8').toString('base64url')
            : directId
    }

    const path = form?.formPath || form?.path
    if (typeof path === 'string' && path.startsWith('/')) {
        return Buffer.from(path, 'utf8').toString('base64url')
    }

    if (typeof form?.url === 'string') {
        const url = new URL(form.url, 'https://aem.invalid')
        const segments = url.pathname.split('/').filter(Boolean)
        const id = segments.at(-1)
        if (id && (url.pathname.includes('/adobe/forms/') || id.startsWith('L'))) return id
    }

    throw new Error('A published form did not include a usable formId or form path.')
}

async function getPublishedForms (baseUrl) {
    const url = new URL(LIST_FORMS_PATH, baseUrl)
    const forms = []
    const seenCursors = new Set()

    for (let page = 0; page < 100; page += 1) {
        const result = await requestJson(url)
        forms.push(...listItems(result))

        const cursor = result?.cursor || result?.nextCursor
        if (!cursor) return forms
        if (seenCursors.has(cursor)) {
            throw new Error('AEM Forms list response repeated a pagination cursor.')
        }
        seenCursors.add(cursor)
        url.searchParams.set('cursor', cursor)
        if (Number.isInteger(result?.limit) && result.limit > 0) {
            url.searchParams.set('limit', String(result.limit))
        }
    }

    throw new Error('AEM Forms listing exceeded the 100-page safety limit.')
}

function stringValue (value) {
    if (typeof value === 'string') return value
    if (typeof value?.value === 'string') return value.value
    return ''
}

function isRequired (field) {
    const required = field.required ?? field.properties?.required ?? field.constraints?.required
    if (typeof required === 'boolean') return required
    return required?.value === true
}

function fieldOptions (field) {
    const values = Array.isArray(field.enum)
        ? field.enum
        : (Array.isArray(field.options) ? field.options : [])

    return values.map(option => {
        if (typeof option === 'string' || typeof option === 'number') return String(option)
        const label = stringValue(option.label || option.title)
        return label || String(option.value ?? option.name ?? '')
    }).filter(Boolean)
}

function extractQuestions (formDefinition) {
    const questions = []
    const visited = new WeakSet()

    function visit (node) {
        if (!node || typeof node !== 'object' || visited.has(node)) return
        visited.add(node)

        if (!Array.isArray(node)) {
            const name = stringValue(node.name || node.dataRef || node.id)
            const type = stringValue(node.fieldType || node.type || node[':type'] || node.componentType)
            const isContainer = /panel|container|wizard|accordion|tab|formroot/i.test(type)
            const isInput = name && !isContainer && !/button|submit|action/i.test(type) && (
                node.fieldType || node.dataRef || node.enum || node.options ||
                node.required !== undefined || node.properties?.required !== undefined
            )

            if (isInput) {
                const label = stringValue(node.label || node.title) || name
                const options = fieldOptions(node)
                questions.push({
                    name,
                    question: `${label}${isRequired(node) ? ' (required)' : ''}`,
                    type: type || 'text',
                    required: isRequired(node),
                    ...(options.length ? { options } : {})
                })
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === 'object') visit(value)
        }
    }

    visit(formDefinition)
    return questions
}

function displayTitle (form) {
    return stringValue(form?.title || form?.name || form?.formTitle) || 'Untitled form'
}

function displayDescription (form) {
    return stringValue(form?.description || form?.summary)
}

async function discoverForms (baseUrl) {
    const forms = await getPublishedForms(baseUrl)
    const discovered = []

    for (const form of forms) {
        const formId = formIdFor(form)
        const definitionUrl = new URL(`/adobe/forms/${encodeURIComponent(formId)}`, baseUrl)
        const definition = await requestJson(definitionUrl)
        discovered.push({
            formId,
            title: displayTitle(form),
            description: displayDescription(form),
            questions: extractQuestions(definition)
        })
    }

    if (!discovered.length) {
        return textResult('No published Adaptive Forms were returned by AEM.')
    }

    const lines = discovered.map(form => {
        const questions = form.questions.length
            ? form.questions.map((field, index) => {
                const options = field.options?.length ? `; options: ${field.options.join(', ')}` : ''
                return `  ${index + 1}. ${field.question} [${field.name}; ${field.type}${options}]`
            }).join('\n')
            : '  No question fields were found in this form definition.'
        const description = displayDescription(form)
        const title = description ? `${form.title}: ${description}` : form.title
        return `- ${title} (formId: ${form.formId})\n${questions}`
    })

    return textResult(
        `Published forms and their questions:\n${lines.join('\n')}\n\n` +
        'Use these questions to identify the right form. For the selected form, ask its questions ' +
        'one at a time in the listed order, honor required fields and options, and review the ' +
        'completed answers with the user before submitting.'
    )
}

function parseAnswers (answersJson) {
    if (typeof answersJson !== 'string' || !answersJson.trim()) {
        throw new Error('Provide answersJson as a JSON object containing the completed form answers.')
    }

    let answers
    try {
        answers = JSON.parse(answersJson)
    } catch {
        throw new Error('answersJson must be valid JSON.')
    }

    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        throw new Error('answersJson must decode to a JSON object.')
    }

    return answers
}

async function submitForm (baseUrl, formId, answers) {
    const submitUrl = new URL(
        `/adobe/forms/af/v1/submit/${encodeURIComponent(formId)}`,
        baseUrl
    )
    const response = await fetch(submitUrl, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            data: JSON.stringify(answers),
            contentType: 'application/json'
        })
    })

    if (!response.ok) {
        throw new Error(`AEM Forms submission failed (HTTP ${response.status}).`)
    }

    let result = {}
    const responseType = response.headers?.get?.('content-type') || ''
    if (responseType.includes('application/json')) {
        result = await response.json()
    }

    const submissionId = result?.submissionId
    const location = response.headers?.get?.('location')
    const reference = submissionId || location

    const outcome = response.status === 202 ? 'submission accepted' : 'submitted'
    return textResult(`Form ${outcome} successfully${reference ? ` (reference: ${reference})` : ''}.`)
}

module.exports = async (args = {}, extra = {}) => {
    if (!args.operation) {
        return textResult('Choose the "discover" operation to review published forms, or "submit" to send confirmed answers.')
    }

    if (args.operation !== 'discover' && args.operation !== 'submit') {
        throw new Error('operation must be either "discover" or "submit".')
    }

    let answers
    if (args.operation === 'submit') {
        if (typeof args.formId !== 'string' || !args.formId.trim()) {
            throw new Error('formId is required when operation is "submit".')
        }
        answers = parseAnswers(args.answersJson)
    }

    const { baseUrl: configuredBaseUrl } = readVariables(extra)
    const baseUrl = validateBaseUrl(configuredBaseUrl)

    if (args.operation === 'discover') {
        return discoverForms(baseUrl)
    }

    return submitForm(baseUrl, args.formId.trim(), answers)
}
