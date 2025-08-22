// ABOUTME: WebDriverIO configuration for NV Switcher plugin E2E testing
// ABOUTME: Uses wdio-obsidian-service for real Obsidian integration with automatic downloads

import * as path from "path"
import { parseObsidianVersions, obsidianBetaAvailable } from "wdio-obsidian-service";
import { env } from "process";

// wdio-obsidian-service will download Obsidian versions into this directory
const cacheDir = path.resolve(".obsidian-cache");

// Choose Obsidian versions to test - start with latest for simplicity
let defaultVersions = "latest/latest";
if (await obsidianBetaAvailable({cacheDir})) {
    defaultVersions += " latest-beta/latest"
}

const desktopVersions = await parseObsidianVersions(
    env.OBSIDIAN_VERSIONS ?? defaultVersions,
    {cacheDir},
);

if (env.CI) {
    // Print the resolved Obsidian versions for CI cache key
    console.log("obsidian-cache-key:", JSON.stringify([desktopVersions]));
}

export const config: WebdriverIO.Config = {
    runner: 'local',
    framework: 'mocha',

    specs: ['./test/specs/**/*.e2e.ts'],

    // Conservative parallelism for stability
    maxInstances: Number(env.WDIO_MAX_INSTANCES || 2),

    // Test matrix: NV Switcher on latest Obsidian
    capabilities: [
        ...desktopVersions.map<WebdriverIO.Capabilities>(([appVersion, installerVersion]) => ({
            browserName: 'obsidian',
            'wdio:obsidianOptions': {
                appVersion, 
                installerVersion,
                plugins: ["."], // Load our plugin
                vault: "test/vaults/nv-switcher", // Our test vault
            },
        }))
    ],

    services: ["obsidian"],
    reporters: ['spec'], // Use built-in spec reporter for now

    mochaOpts: {
        ui: 'bdd',
        timeout: 60 * 1000, // 60 second timeout
        retries: 2, // Retry flaky tests
    },
    
    waitforInterval: 250,
    waitforTimeout: 10 * 1000, // 10 second wait timeout
    logLevel: "warn",

    cacheDir: cacheDir,

    // Global hooks
    before: async function() {
        console.log('🚀 Starting NV Switcher E2E tests with real Obsidian');
    },

    after: async function() {
        console.log('✅ NV Switcher E2E tests completed');
    },

    beforeTest: async function(test, context) {
        console.log(`🧪 Starting test: ${test.title}`);
    },

    afterTest: async function(test, context, { error }) {
        if (error) {
            console.log(`❌ Test failed: ${test.title}`);
            // Take screenshot on failure
            await browser.takeScreenshot();
        } else {
            console.log(`✅ Test passed: ${test.title}`);
        }
    }
};