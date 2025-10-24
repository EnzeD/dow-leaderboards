"use client";

import { EnrichedReplayProfile } from '@/lib/replay-player-matching';
import ProBadge from "@/components/ProBadge";
// Import faction icons
import chaosIcon from "../../assets/factions/chaos.png";
import darkEldarIcon from "../../assets/factions/darkeldar.png";
import eldarIcon from "../../assets/factions/eldar.png";
import imperialGuardIcon from "../../assets/factions/imperialguard.png";
import necronIcon from "../../assets/factions/necron.png";
import orkIcon from "../../assets/factions/ork.png";
import sistersIcon from "../../assets/factions/sister.png";
import spaceMarineIcon from "../../assets/factions/spacemarine.png";
import tauIcon from "../../assets/factions/tau.png";
import type { StaticImageData } from 'next/image';

// Normalize country code helper
const normalizeCountryCode = (code?: string): string | null => {
  if (!code) return null;
  const trimmed = code.trim().toLowerCase();
  return trimmed.length === 2 ? trimmed : null;
};

// Get faction-specific colors
const getFactionColor = (faction: string): string => {
  const factionColors: Record<string, string> = {
    'Chaos': 'text-red-400',
    'Dark Eldar': 'text-purple-400',
    'Eldar': 'text-blue-400',
    'Imperial Guard': 'text-yellow-400',
    'Necrons': 'text-emerald-300',
    'Orks': 'text-green-400',
    'Sisters of Battle': 'text-pink-400',
    'Space Marines': 'text-blue-300',
    'Tau': 'text-cyan-400'
  };
  return factionColors[faction] || 'text-orange-300';
};

// Map faction → icon path
const FACTION_ICON_MAP: Record<string, StaticImageData | string> = {
  'Chaos': chaosIcon,
  'Dark Eldar': darkEldarIcon,
  'Eldar': eldarIcon,
  'Imperial Guard': imperialGuardIcon,
  'Necrons': necronIcon,
  'Orks': orkIcon,
  'Sisters of Battle': sistersIcon,
  'Space Marines': spaceMarineIcon,
  'Tau': tauIcon,
};

// Faction logo component
const FactionLogo = ({ faction, size = 14 }: { faction?: string; size?: number }) => {
  const icon = faction ? FACTION_ICON_MAP[faction] : undefined;
  if (!icon) return null;
  const url = typeof icon === 'string' ? icon : (icon as any).src || '';
  const dim = `${size}px`;
  const offset = Math.max(1, Math.round(size * 0.06));
  return (
    <span
      aria-hidden
      className="inline-block align-middle"
      style={{
        width: dim,
        height: dim,
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        display: 'inline-block',
        position: 'relative',
        top: `${offset}px`,
      }}
    />
  );
};

// Flag icon component
const FlagIcon = ({ countryCode }: { countryCode: string }) => {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return null;
  const isoCode = normalized.toUpperCase();
  const flagHeight = '0.7rem';
  const flagWidth = `calc(${flagHeight} * 4 / 3)`;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-neutral-700/80 rounded-md border border-neutral-600/50 shadow-sm backdrop-blur-sm"
      title={isoCode}
    >
      <span
        className={`fi fi-${normalized}`}
        aria-hidden="true"
        style={{
          width: flagWidth,
          minWidth: flagWidth,
          height: flagHeight,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
          borderRadius: '0.25rem'
        }}
      />
      <span className="uppercase tracking-wide font-mono font-semibold text-neutral-200 text-[0.6rem]">
        {isoCode}
      </span>
    </span>
  );
};

interface ClickablePlayerProps {
  profile: EnrichedReplayProfile;
  onPlayerClick?: (playerName: string, profileId?: string) => void;
  showFaction?: boolean;
  showDetails?: boolean;  // Show rating, flag, etc.
  compact?: boolean;      // Compact display mode
  className?: string;
  showProBadge?: boolean; // Whether to show Pro badge
  isProMember?: boolean;  // Whether player is Pro member
}

export default function ClickablePlayer({
  profile,
  onPlayerClick,
  showFaction = true,
  showDetails = true,
  compact = false,
  className = "",
  showProBadge = false,
  isProMember = false
}: ClickablePlayerProps) {
  const isLinked = Boolean(profile.profile_id);
  const displayName = profile.current_alias || profile.alias;
  const factionColor = getFactionColor(profile.faction);

  const handleClick = () => {
    if (isLinked && onPlayerClick) {
      onPlayerClick(displayName, profile.profile_id);
    }
  };

  const baseClassName = isLinked
    ? `cursor-pointer hover:underline text-white transition-colors`
    : "text-neutral-300";

  const confidenceTooltip = profile.match_confidence
    ? `Database match (${Math.round(profile.match_confidence * 100)}% confidence)`
    : 'Linked to database player';

  const tooltip = isLinked ? confidenceTooltip : 'Player not in database';

  const content = (
    <span className="inline-flex items-center gap-2">
      {/* Country flag (if available) */}
      {profile.country && (
        <FlagIcon countryCode={profile.country} />
      )}

      {/* Player name */}
      <span className="font-medium">{displayName}</span>

      {/* Pro badge */}
      {isProMember && showProBadge && <ProBadge size="sm" />}

      {/* Faction with colored icon */}
      {showFaction && (
        <span className={`inline-flex items-center gap-1 ${factionColor}`}>
          <FactionLogo faction={profile.faction} size={compact ? 12 : 14} />
          <span className="text-xs">{profile.faction}</span>
        </span>
      )}
    </span>
  );

  if (isLinked) {
    return (
      <button
        onClick={handleClick}
        className={`${baseClassName} ${className}`}
        title={tooltip}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={`${baseClassName} ${className}`} title={tooltip}>
      {content}
    </span>
  );
}

interface PlayerTeamProps {
  profiles: EnrichedReplayProfile[] | null;
  team: number;
  onPlayerClick?: (playerName: string, profileId?: string) => void;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

export function PlayerTeam({
  profiles,
  team,
  onPlayerClick,
  showDetails = false,
  compact = false,
  className = ""
}: PlayerTeamProps) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return <span className={className}>Unknown</span>;
  }

  const members = profiles.filter(p => Number(p?.team) === team);
  if (members.length === 0) {
    return <span className={className}>—</span>;
  }

  return (
    <span className={className}>
      {members.map((profile, index) => (
        <span key={`${profile.alias}-${index}`}>
          {index > 0 && <span className="text-neutral-500 mx-1">·</span>}
          <ClickablePlayer
            profile={profile}
            onPlayerClick={onPlayerClick}
            showFaction={true}
            showDetails={showDetails}
            compact={compact}
          />
        </span>
      ))}
    </span>
  );
}

interface PlayerListProps {
  profiles: EnrichedReplayProfile[] | null;
  onPlayerClick?: (playerName: string, profileId?: string) => void;
  showTeams?: boolean;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

export function PlayerList({
  profiles,
  onPlayerClick,
  showTeams = true,
  showDetails = true,
  compact = false,
  className = ""
}: PlayerListProps) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return <span className={className}>No players</span>;
  }

  return (
    <span className={className}>
      {profiles.map((profile, index) => (
        <span key={`${profile.alias}-${index}`}>
          {index > 0 && <span className="text-neutral-500 mx-1">·</span>}
          <ClickablePlayer
            profile={profile}
            onPlayerClick={onPlayerClick}
            showFaction={true}
            showDetails={showDetails}
            compact={compact}
          />
          {showTeams && (
            <span className="text-neutral-400 text-xs ml-1">[Team {profile.team}]</span>
          )}
        </span>
      ))}
    </span>
  );
}