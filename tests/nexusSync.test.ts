import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createEmptyProfile } from '@/core/profile';
import { ensureRemoteProfile, isLocalProfileEmpty, remoteToProfile } from '@/core/nexusSync';
import type { AppState } from '@/core/storage';
import { defaultState } from '@/core/storage';
import type { SupabaseSession } from '@/core/supabase';

describe('nexusSync', () => {
  describe('isLocalProfileEmpty', () => {
    it('detects a fresh default profile', () => {
      expect(isLocalProfileEmpty(createEmptyProfile())).toBe(true);
    });

    it('detects when the student has entered data', () => {
      const profile = createEmptyProfile();
      profile.firstName = 'Alex';
      expect(isLocalProfileEmpty(profile)).toBe(false);
    });
  });

  describe('remoteToProfile', () => {
    it('prefers Supabase website fields over an empty local profile', () => {
      const merged = remoteToProfile(
        {
          id: 'user-1',
          email: 'alex@school.edu',
          first_name: 'Alex',
          last_name: 'Rivera',
          gpa: 3.8,
          major: 'Computer Science',
          grade_level: 'High School Senior',
          state: 'CA',
          school: 'Lincoln High',
          graduation_year: 2027,
          fafsa_completed: true,
          demographics: {
            firstGeneration: true,
            ethnicities: ['hispanic'],
            gender: 'Female',
          },
        },
        createEmptyProfile(),
      );

      expect(merged.email).toBe('alex@school.edu');
      expect(merged.firstName).toBe('Alex');
      expect(merged.lastName).toBe('Rivera');
      expect(merged.academics.gpa).toBe(3.8);
      expect(merged.academics.intendedMajors).toEqual(['Computer Science']);
      expect(merged.academics.level).toBe('high-school-senior');
      expect(merged.state).toBe('CA');
      expect(merged.academics.currentSchool).toBe('Lincoln High');
      expect(merged.academics.graduationYear).toBe(2027);
      expect(merged.financials.fafsaFiled).toBe(true);
      expect(merged.demographics.firstGeneration).toBe(true);
      expect(merged.demographics.ethnicities).toEqual(['hispanic']);
    });

    it('reads extension-only fields from demographics.extension', () => {
      const merged = remoteToProfile(
        {
          id: 'user-1',
          full_name: 'Jamie Lee',
          demographics: {
            extension: {
              activities: [{ id: 'a1', name: 'Robotics Club' }],
              weeklyHoursAvailable: 8,
              city: 'Austin',
            },
          },
        },
        createEmptyProfile(),
      );

      expect(merged.firstName).toBe('Jamie');
      expect(merged.lastName).toBe('Lee');
      expect(merged.city).toBe('Austin');
      expect(merged.weeklyHoursAvailable).toBe(8);
      expect(merged.activities).toEqual([{ id: 'a1', name: 'Robotics Club' }]);
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

    it('posts profile rows as a JSON array for PostgREST', async () => {
      const local: AppState = defaultState();
      local.profile.firstName = 'Casey';
      local.profile.lastName = 'Ng';
      local.profile.academics.gpa = 3.5;

      await ensureRemoteProfile(session, local);

      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const payload = JSON.parse(String(init?.body));
      expect(Array.isArray(payload)).toBe(true);
      expect(payload[0].id).toBe(session.user.id);
      expect(payload[0].first_name).toBe('Casey');
      expect(payload[0].gpa).toBe(3.5);
    });
  });
});
