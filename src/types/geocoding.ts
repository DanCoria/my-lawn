export interface GeocodingResult {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country?: string;
    postcodes?: string[];
}
