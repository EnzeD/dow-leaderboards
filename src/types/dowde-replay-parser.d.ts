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
    /** Raw duration in seconds exposed by newer versions of the parser */
    matchdurationseconds?: number;
    matchDurationSeconds?: number;
    /** Optional formatted duration label exposed by newer versions of the parser */
    matchdurationlabel?: string;
    matchDurationLabel?: string;
    profiles?: ReplayProfile[];
    [key: string]: any;
  }

  export function parseReplay(filePath: string): ParsedReplay;
}