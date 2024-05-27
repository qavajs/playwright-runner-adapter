type CucumberConfig = {
    config: string,
    profile?: string
}
export function defineCucumber(config: CucumberConfig) {
    process.env.CONFIG = config.config;
    process.env.PROFILE = config.profile;
}
