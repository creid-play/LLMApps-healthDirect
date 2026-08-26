/**
 * weather-lookup action handler with widget.
 *
 * Returns both:
 *   - content: text for the LLM / fallback hosts
 *   - structuredContent: plain object consumed by widget.html via
 *                        window.openai.toolOutput
 *
 * Metadata lives in the llm-apps UI. Widget HTML lives next to this file.
 *
 * Uses Open-Meteo (no API key required) so the example works out of the box.
 */

// WMO weather codes -> short human-readable label.
const WEATHER_CODES = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
}

module.exports = async ({ city }) => {
    if (!city || !city.trim()) {
        return {
            content: [
                { type: 'text', text: 'Please provide a city name, e.g. "San Francisco".' }
            ]
        }
    }

    const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    )
    const geoData = await geoRes.json()
    const place = geoData?.results?.[0]

    if (!place) {
        return {
            content: [
                { type: 'text', text: `Couldn't find a location named "${city}".` }
            ]
        }
    }

    const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code' +
        '&temperature_unit=fahrenheit&wind_speed_unit=mph'
    )
    const forecastData = await forecastRes.json()
    const current = forecastData?.current

    const locationLabel = [place.name, place.admin1, place.country].filter(Boolean).join(', ')
    const conditions = WEATHER_CODES[current?.weather_code] || 'Unknown conditions'

    const summary = `${locationLabel}: ${Math.round(current?.temperature_2m)}°F, ${conditions}, ` +
        `feels like ${Math.round(current?.apparent_temperature)}°F, wind ${Math.round(current?.wind_speed_10m)} mph.`

    // IMPORTANT: structuredContent must be a plain object, NOT a bare array.
    const data = {
        location: locationLabel,
        latitude: place.latitude,
        longitude: place.longitude,
        temperatureF: current?.temperature_2m,
        feelsLikeF: current?.apparent_temperature,
        humidityPct: current?.relative_humidity_2m,
        windMph: current?.wind_speed_10m,
        conditions,
        observedAt: current?.time
    }

    return {
        content: [
            { type: 'text', text: summary }
        ],
        structuredContent: data
    }
}
