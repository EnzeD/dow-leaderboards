declare module 'dowde-replay-parser' {
  export interface ReplayProfile {
    alias: string;
    faction: string;
    team: number;
  }

  export interface ParsedReplay {
    replayname?: string;
    mapname?: string;
    matchduration?: string;
    profiles?: ReplayProfile[];
    [key: string]: any;
  }

  export function parseReplay(filePath: string): ParsedReplay;
}