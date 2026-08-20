import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createEmptyProfile } from '@/core/profile';
import {
  ensureRemoteProfile,
  isLocalProfileEmpty,
  remoteToProfile,
} from '@/core/nexusSync';
import {
  isPlaceholderText,
  profileToSupabaseRow,
  splitFullName,
  supabaseRowToProfile,
} from '@/core/profileSchema';
import type { AppState } from '@/core/storage';
import { defaultState } from '@/core/storage';
import type { SupabaseSession } from '@/core/supabase';

describe('profileSchema', () => {
  it('ignores website placeholder strings', () => {
    expect(isPlaceholderText('Enter your phone')).toBe(true);
    expect(isPlaceholderText('Julia Wang')).toBe(false);
  });

  it('splits and joins full names', () => {
    expect(splitFullName('Julia Wang')).toEqual({ firstName: 'Julia', lastName: 'Wang' });
  });

  it('maps a Supabase profile row into the extension profile', () => {
    const merged = supabaseRowToProfile(
      {
        id: 'user-1',
        full_name: 'Julia Wang',
        email: 'jw4280@barnard.edu',
        phone: 'Enter your phone',
        school: 'Barnard College',
        graduation_year: 2027,
        gpa: 3.7,
        major: 'Computer Science',
        bio: 'Interested in CS scholarships.',
        grade_level: 'Junior',
        state: 'Washington',
        demographics: ['Woman'],
        first_generation: true,
        disability: false,
        lgbtq: false,
      },
      createEmptyProfile(),
    );

    expect(merged.firstName).toBe('Julia');
    expect(merged.lastName).toBe('Wang');
    expect(merged.email).toBe('jw4280@barnard.edu');
    expect(merged.phone).toBeUndefined();
    expect(merged.academics.gpa).toBe(3.7);
    expect(merged.academics.intendedMajors).toEqual(['Computer Science']);
    expect(merged.academics.level).toBe('undergrad-junior');
    expect(merged.academics.currentSchool).toBe('Barnard College');
    expect(merged.state).toBe('Washington');
    expect(merged.bio).toBe('Interested in CS scholarships.');
    expect(merged.demographics.tags).toEqual(['Woman']);
    expect(merged.demographics.firstGeneration).toBe(true);
  });

  it('writes only real Supabase profile columns', () => {
    const profile = createEmptyProfile();
    profile.firstName = 'Julia';
    profile.lastName = 'Wang';
    profile.academics.gpa = 3.7;
    profile.academics.intendedMajors = ['Computer Science'];
    profile.academics.level = 'undergrad-junior';
    profile.demographics.tags = ['Woman'];

    const row = profileToSupabaseRow(profile, 'user-1', 'jw4280@barnard.edu');
    expect(row).toEqual({
      id: 'user-1',
      full_name: 'Julia Wang',
      email: 'jw4280@barnard.edu',
      gpa: 3.7,
      major: 'Computer Science',
      grade_level: 'Junior',
      demographics: ['Woman'],
    });
    expect('first_name' in row).toBe(false);
    expect('last_name' in row).toBe(false);
  });
});

describe('nexusSync', () => {
  describe('isLocalProfileEmpty', () => {
    it('detects a fresh default profile', () => {
      expect(isLocalProfileEmpty(createEmptyProfile())).toBe(true);
    });
  });

  describe('remoteToProfile export', () => {
    it('exports supabaseRowToProfile as remoteToProfile', () => {
      const merged = remoteToProfile(
        { id: 'user-1', full_name: 'Jamie Lee', grade_level: 'Senior' },
        createEmptyProfile(),
      );
      expect(merged.firstName).toBe('Jamie');
      expect(merged.academics.level).toBe('undergrad-senior');
    });
  });

  describe('ensureRemoteProfile', () => {
    const session: SupabaseSession = {
      access_token: 'token',
      refresh_token: 'refresh',
      user: { id: '11111111-1111-1111-1111-111111111111', email: 'test@example.com' },
    };

    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 201 })));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('posts profile rows as a JSON array using website columns', async () => {
      const local: AppState = defaultState();
      local.profile.firstName = 'Julia';
      local.profile.lastName = 'Wang';
      local.profile.academics.gpa = 3.7;

      await ensureRemoteProfile(session, local);

      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const payload = JSON.parse(String(init?.body));
      expect(Array.isArray(payload)).toBe(true);
      expect(payload[0].full_name).toBe('Julia Wang');
      expect(payload[0].first_name).toBeUndefined();
    });
  });
});
