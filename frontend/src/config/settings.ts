// Environment-specific settings
const ENV = import.meta.env.MODE;

interface Settings {
    apiUrl: string;
    appName: string;
    logoUrl: string;
}

// Get the current host
const currentHost = window.location.hostname;
const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

const productionSettings: Settings = {
    apiUrl: 'https://tablethat-api.ironcliff.ai',
    appName: 'table.that',
    logoUrl: '/logo.png'
};

const developmentSettings: Settings = {
    apiUrl: isLocalhost ? 'http://localhost:8000' : `http://${currentHost}:8000`,
    appName: 'table.that (Dev)',
    logoUrl: '/logo.png'
};

const settings: Settings = ENV === 'production' ? productionSettings : developmentSettings;

export default settings;
