#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STEAM_APP_ID = process.env.STEAM_APP_ID || '3556750'; // DoW:DE
const OUTPUT_PATH = path.join(__dirname, '../public/player-count.json');

async function fetchSteamPlayerCount() {
  const url = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${STEAM_APP_ID}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Steam API returned ${response.status}`);
    }

    const data = await response.json();
    const playerCount = data?.response?.player_count;

    if (data?.response?.result !== 1 || typeof playerCount !== 'number') {
      throw new Error('Invalid response from Steam API');
    }

    return playerCount;
  } catch (error) {
    console.error('Failed to fetch player count:', error);
    return null;
  }
}

async function updatePlayerCountFile() {
  try {
    const playerCount = await fetchSteamPlayerCount();

    const data = {
      appId: STEAM_APP_ID,
      playerCount: playerCount,
      success: playerCount !== null,
      lastUpdated: new Date().toISOString(),
      error: playerCount === null ? 'fetch_failed' : undefined
    };

    // Ensure public directory exists
    const publicDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the JSON file
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));

    console.log(`Updated player count: ${playerCount} at ${data.lastUpdated}`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to update player count file:', error);
    process.exit(1);
  }
}

// Run the update
updatePlayerCountFile();