/**
 * Unit tests for the weather-lookup action handler.
 *
 * Handler tests live under test/actions/, NOT co-located with the handler,
 * so webpack doesn't bundle them into dist/index.js at deploy time.
 *
 * Run with:
 *   npm test                                 # all test files
 *   npx jest test/actions/weather-lookup      # only this file
 */

const handler = require('../../actions/weather-lookup/index.js')

function mockFetchSequence (responses) {
    let call = 0
    global.fetch = jest.fn(() => {
        const body = responses[call]
        call += 1
        return Promise.resolve({ json: () => Promise.resolve(body) })
    })
}

describe('weather-lookup handler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        delete global.fetch
    })

    test('missing city returns a prompt, no network call', async () => {
        global.fetch = jest.fn()

        const out = await handler({})

        expect(out.content[0].text).toMatch(/provide a city/i)
        expect(global.fetch).not.toHaveBeenCalled()
    })

    test('unknown city returns a not-found message', async () => {
        mockFetchSequence([{ results: [] }])

        const out = await handler({ city: 'Nowhereville' })

        expect(out.content[0].text).toMatch(/couldn't find/i)
        expect(out.structuredContent).toBeUndefined()
    })

    test('happy path returns content + structuredContent as a plain object', async () => {
        mockFetchSequence([
            {
                results: [
                    { name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5, longitude: -0.1 }
                ]
            },
            {
                current: {
                    temperature_2m: 60.1,
                    apparent_temperature: 58.4,
                    relative_humidity_2m: 72,
                    wind_speed_10m: 8.3,
                    weather_code: 3,
                    time: '2026-08-26T12:00'
                }
            }
        ])

        const out = await handler({ city: 'London' })

        expect(out.content[0]).toMatchObject({ type: 'text', text: expect.any(String) })
        expect(out.content[0].text).toContain('London, England, United Kingdom')
        expect(out.content[0].text).toContain('Overcast')

        expect(typeof out.structuredContent).toBe('object')
        expect(Array.isArray(out.structuredContent)).toBe(false)
        expect(out.structuredContent).toMatchObject({
            location: 'London, England, United Kingdom',
            temperatureF: 60.1,
            conditions: 'Overcast'
        })
    })
})
