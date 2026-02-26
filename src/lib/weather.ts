// Open-Meteo weather — dynamic location support
const DEFAULT_LAT = 32.78;
const DEFAULT_LON = -96.80;

export interface WeatherData {
    currentTemp: number;
    currentWindSpeed: number;
    isRaining: boolean;
    rainToday: number;
    rainNext48h: number;
    soilTemp: number | null;
    highToday: number;
    lowToday: number;
    conditions: string;
}

export interface LawnWeatherAdvice {
    canMow: boolean;
    canWater: boolean;
    canFertilize: boolean;
    mowReason: string;
    waterReason: string;
    fertReason: string;
}

export async function fetchWeather(lat?: number | null, lon?: number | null): Promise<WeatherData> {
    const useLat = lat ?? DEFAULT_LAT;
    const useLon = lon ?? DEFAULT_LON;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${useLat}&longitude=${useLon}&current=temperature_2m,wind_speed_10m,rain,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=3`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather fetch failed');
    const data = await res.json();

    const current = data.current;
    const daily = data.daily;
    const rainNext48h = (daily.precipitation_sum[0] || 0) + (daily.precipitation_sum[1] || 0);

    return {
        currentTemp: Math.round(current.temperature_2m),
        currentWindSpeed: Math.round(current.wind_speed_10m),
        isRaining: current.rain > 0,
        rainToday: daily.precipitation_sum[0] || 0,
        rainNext48h,
        soilTemp: null,
        highToday: Math.round(daily.temperature_2m_max[0]),
        lowToday: Math.round(daily.temperature_2m_min[0]),
        conditions: weatherCodeToText(current.weather_code),
    };
}

// Keep backward compat alias
export const fetchDFWWeather = () => fetchWeather();

function weatherCodeToText(code: number): string {
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Partly Cloudy';
    if (code <= 48) return 'Foggy';
    if (code <= 57) return 'Drizzle';
    if (code <= 65) return 'Rain';
    if (code <= 67) return 'Freezing Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Rain Showers';
    if (code <= 86) return 'Snow Showers';
    if (code >= 95) return 'Thunderstorm';
    return 'Unknown';
}

export function getWeatherAdvice(weather: WeatherData): LawnWeatherAdvice {
    const wetGround = weather.isRaining || weather.rainToday > 0.25;
    const tooWindy = weather.currentWindSpeed > 20;
    const tooCold = weather.currentTemp < 50;

    let canMow = true;
    let mowReason = 'Good conditions for mowing';
    if (weather.isRaining) { canMow = false; mowReason = '🌧️ Raining — wait for dry grass'; }
    else if (wetGround) { canMow = false; mowReason = '💧 Ground is wet — let it dry first'; }
    else if (tooWindy) { canMow = false; mowReason = '💨 Too windy — clippings will scatter'; }
    else if (tooCold) { canMow = false; mowReason = '🥶 Too cold — grass isn\'t growing'; }

    let canWater = true;
    let waterReason = 'No rain expected — water if needed';
    if (weather.isRaining) { canWater = false; waterReason = '🌧️ It\'s raining — nature\'s got you covered'; }
    else if (weather.rainNext48h > 0.5) { canWater = false; waterReason = `🌧️ ${weather.rainNext48h.toFixed(1)}" rain expected — hold off`; }
    else if (weather.rainToday > 0.3) { canWater = false; waterReason = '💧 Already got rain today — skip watering'; }

    let canFertilize = true;
    let fertReason = 'Safe to fertilize today';
    if (weather.rainNext48h > 0.5) { canFertilize = false; fertReason = '🌧️ Rain coming — fertilizer will wash away'; }
    else if (wetGround) { canFertilize = false; fertReason = '💧 Wet ground — wait for it to dry'; }
    else if (weather.currentTemp > 95) { canFertilize = false; fertReason = '🔥 Too hot — risk of burning the lawn'; }
    else if (tooCold) { canFertilize = false; fertReason = '🥶 Too cold — grass can\'t absorb nutrients'; }

    return { canMow, canWater, canFertilize, mowReason, waterReason, fertReason };
}
