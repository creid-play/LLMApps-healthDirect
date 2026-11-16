/**
 * Discovers published AEM Forms and submits completed headless forms.
 *
 * The published Forms API is accessed anonymously. AEM_FORMS_BASE_URL can
 * override the default publish host for another environment.
 */

const DEFAULT_AEM_FORMS_BASE_URL = 'https://publish-p206352-e2156078.adobeaemcloud.com'
const LIST_FORMS_PATH = '/adobe/forms/af/listforms'

function textResult (text, structuredContent) {
    return {
        content: [{ type: 'text', text }],
        ...(structuredContent ? { structuredContent } : {})
    }
}

function textError (text) {
    return { ...textResult(text), isError: true }
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
        if (typeof option === 'string' || typeof option === 'number') {
            return { label: String(option), value: String(option) }
        }
        const value = option.value ?? option.name ?? option.label ?? option.title
        const normalizedValue = typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : stringValue(value)
        const label = stringValue(option.label || option.title) || normalizedValue
        return !normalizedValue || !label
            ? null
            : { label, value: normalizedValue }
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
                const options = field.options?.length
                    ? `; choices to show the user: ${field.options.map(option => option.label).join(', ')}` +
                      `; internal submission mapping (do not show): ${field.options.map(option =>
                          `${JSON.stringify(option.label)} => ${JSON.stringify(option.value)}`
                      ).join(', ')}`
                    : ''
                return `  ${index + 1}. ${field.question} [${field.name}; ${field.type}${options}]`
            }).join('\n')
            : '  No question fields were found in this form definition.'
        const description = displayDescription(form)
        const title = description ? `${form.title}: ${description}` : form.title
        return `- ${title} (formId: ${form.formId})\n${questions}`
    })

    return textResult(
        `Published forms and their questions:\n${lines.join('\n')}\n\n` +
        'Use the user’s goal to identify and suggest all relevant forms from this list, including ' +
        'related applications they may not have explicitly requested. For example, when a user wants ' +
        'to open a small business, suggest the loan application, account application, and point-of-sale ' +
        'application when those forms are available. Do not invent forms that are not listed. Guide the ' +
        'user through relevant form questions one at a time. Whenever a field has predefined options, ' +
        'present only each option’s exact display label with ChatGPT’s native choice selector. Never ' +
        'include the underlying data value in the selector or in text shown to the user. Keep the ' +
        'label-to-value mapping from discovery internal; after the user selects a display label, map it ' +
        'back to that option’s exact data value for the form answer. Do not call a widget or choose an ' +
        'answer for the user. If a native selector is unavailable, list only the exact display labels in ' +
        'chat and ask the user to choose. Obtain explicit confirmation of all answers before calling submit.'
    )
}

function parseAnswers (value) {
    let answers = value
    if (typeof value === 'string') {
        if (!value.trim()) {
            throw new Error('Provide answers or answersJson containing the completed form answers.')
        }
        try {
            answers = JSON.parse(value)
        } catch {
            throw new Error('answersJson must be valid JSON.')
        }
    }

    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        throw new Error('answers or answersJson must be a JSON object.')
    }

    return answers
}

async function submitForm (baseUrl, formId, answers) {
    const submitUrl = new URL(
        `/adobe/forms/af/submit/${encodeURIComponent(formId)}`,
        baseUrl
    )
    const request = {
        method: 'POST',
        url: submitUrl.toString(),
        headers: {
            accept: 'application/json',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            data: answers,
            submitMetadata: {}
        })
    }
    const requestDetails = `\n\nRequest sent to AEM Forms:\n${JSON.stringify(request, null, 2)}`

    console.log('[aem-forms-guide] submission request started')
    let response
    try {
        response = await fetch(submitUrl, {
            method: request.method,
            redirect: 'manual',
            headers: request.headers,
            body: request.body
        })
    } catch (error) {
        console.error('[aem-forms-guide] submission request failed before receiving a response')
        return textError(
            `AEM Forms submission request failed before receiving a response: ${error.message}.${requestDetails}`
        )
    }

    if (response.status >= 300 && response.status < 400) {
        console.error(`[aem-forms-guide] submission endpoint redirected the POST (HTTP ${response.status})`)
        return textError(
            `AEM Forms submission endpoint redirected the POST request (HTTP ${response.status}); ` +
            `automatic redirects are disabled to prevent changing the submission method.${requestDetails}`
        )
    }

    if (!response.ok) {
        const allowedMethods = response.headers?.get?.('allow')
        console.error(`[aem-forms-guide] submission request failed (HTTP ${response.status})`)
        return textError(
            `AEM Forms submission failed (HTTP ${response.status})` +
            `${allowedMethods ? `; endpoint allows: ${allowedMethods}` : ''}. ` +
            `Verify the publish host and the form submission configuration.${requestDetails}`
        )
    }

    let result = {}
    const responseType = response.headers?.get?.('content-type') || ''
    if (responseType.includes('application/json')) {
        try {
            result = await response.json()
        } catch (error) {
            console.error('[aem-forms-guide] could not parse the submission response')
            return textError(
                `AEM Forms returned HTTP ${response.status}, but its JSON response could not be parsed: ` +
                `${error.message}.${requestDetails}`
            )
        }
    }

    const submissionId = result?.submissionId
    const location = response.headers?.get?.('location')
    const reference = submissionId || location

    const outcome = response.status === 202 ? 'submission accepted' : 'submitted'
    console.log(`[aem-forms-guide] submission request completed (HTTP ${response.status})`)
    return textResult(
        `Form ${outcome} successfully${reference ? ` (reference: ${reference})` : ''}.${requestDetails}`
    )
}

module.exports = async (args = {}, extra = {}) => {
    const hasSubmissionArguments = args.formId !== undefined ||
        args.answers !== undefined ||
        args.answersJson !== undefined
    const operation = args.operation || (hasSubmissionArguments ? 'submit' : null)
    const argumentKeys = args && typeof args === 'object'
        ? Object.keys(args).sort()
        : []

    console.log('[aem-forms-guide] dispatch selected', JSON.stringify({
        requestedOperation: typeof args.operation === 'string' ? args.operation : null,
        selectedOperation: typeof operation === 'string' ? operation : '[invalid]',
        argumentKeys
    }))

    if (operation === null) {
        throw new Error('operation is required; use "discover" to list forms or "submit" to submit answers.')
    }

    if (operation !== 'discover' && operation !== 'submit') {
        if (operation === 'present-choice') {
            return require('../aem-forms-choice/index.js')(args)
        }
        throw new Error('operation must be "discover", "present-choice", or "submit".')
    }

    let answers
    if (operation === 'submit') {
        if (typeof args.formId !== 'string' || !args.formId.trim()) {
            throw new Error('formId is required when operation is "submit".')
        }
        answers = parseAnswers(args.answers ?? args.answersJson)
    }

    const { baseUrl: configuredBaseUrl } = readVariables(extra)
    const baseUrl = validateBaseUrl(configuredBaseUrl)

    if (operation === 'discover') {
        const result = await discoverForms(baseUrl)
        console.log('[aem-forms-guide] discovery completed')
        return result
    }

    return submitForm(baseUrl, args.formId.trim(), answers)
}
