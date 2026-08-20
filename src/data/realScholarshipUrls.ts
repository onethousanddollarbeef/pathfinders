/**
 * Maps Nexus catalog entries to live application pages on real scholarship sites.
 * Supabase seed rows use example.org placeholders; these overrides link students
 * to the actual databases and programs featured on nexusnext.lovable.app/explore.
 */

export const REAL_SCHOLARSHIP_URL_OVERRIDES: Record<string, string> = {
  '6961b1f5-ba52-4646-a3b1-de1ebae3edb0': 'https://www.hsf.net/scholarship',
  '435a1cba-099b-4ea9-aa37-75245b86b324': 'https://www.va.gov/education/about-gi-bill-benefits/',
  'f19579f0-975b-462c-9d17-1fbe06ebb8ac': 'https://studentaid.gov/h/apply-for-aid/fafsa',
  'c48e8643-b30b-4352-941e-3134b667f475': 'https://scholarshipamerica.org/students/browse-scholarships/',
  '0e8bd043-3460-4335-b5d7-df8cae53dc16': 'https://scholarshipamerica.org/students/browse-scholarships/',
  'c18f5bd0-0002-4613-9423-145c1c6f8625': 'https://uncf.org/scholarships',
  '7dc51c53-b018-4ad2-ab1e-fc67c3c4e23c': 'https://www.fastweb.com/college-scholarships/articles/top-stem-scholarships',
  '12f90f1c-30fd-411c-9600-1f1279c18600': 'https://www.fastweb.com/college-scholarships/articles/scholarships-for-women-in-stem',
  'fff676ba-860d-47f7-82dc-4783ec000687': 'https://bigfuture.collegeboard.org/scholarship-search',
  'ede5c120-b3f7-4437-a063-de4ee9e200d5': 'https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory/state/california',
  '762d079f-cb7b-4714-993f-ab90f0a8e229': 'https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory/state/texas',
  '6216bb3b-6124-4dbd-b0d8-6277cf93acfe': 'https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory/state/new-york',
};

export interface ScholarshipSearchSite {
  name: string;
  description: string;
  url: string;
}

/** Live scholarship databases linked from nexusnext.lovable.app/explore */
export const SCHOLARSHIP_SEARCH_SITES: ScholarshipSearchSite[] = [
  {
    name: 'Federal Student Aid (FAFSA)',
    description: 'Start here — federal grants and loans with official deadlines.',
    url: 'https://studentaid.gov/h/apply-for-aid/fafsa',
  },
  {
    name: 'Fastweb',
    description: 'Large, continuously refreshed scholarship database matched to your profile.',
    url: 'https://www.fastweb.com/',
  },
  {
    name: 'Scholarships.com',
    description: 'Searchable listings with live deadline filtering across thousands of awards.',
    url: 'https://www.scholarships.com/',
  },
  {
    name: 'College Board BigFuture',
    description: 'Scholarship search backed by College Board, updated throughout the year.',
    url: 'https://bigfuture.collegeboard.org/scholarship-search',
  },
  {
    name: 'Going Merry',
    description: 'Apply to bundles of scholarships with one profile; new awards added weekly.',
    url: 'https://www.goingmerry.com/',
  },
  {
    name: 'Bold.org',
    description: 'Exclusive, frequently posted scholarships with quick applications.',
    url: 'https://bold.org/scholarships/',
  },
  {
    name: 'Scholarship America',
    description: 'Nonprofit programs, including many for first-generation students.',
    url: 'https://scholarshipamerica.org/students/browse-scholarships/',
  },
  {
    name: 'Hispanic Scholarship Fund',
    description: 'Annual and rolling awards for Hispanic and Latino students.',
    url: 'https://www.hsf.net/scholarship',
  },
  {
    name: 'UNCF',
    description: 'Hundreds of active scholarships for Black students, refreshed each cycle.',
    url: 'https://uncf.org/scholarships',
  },
  {
    name: 'Career OneStop Scholarship Finder',
    description: 'U.S. Department of Labor database of 8,000+ awards.',
    url: 'https://www.careeronestop.org/Toolkit/Training/find-scholarships.aspx',
  },
];
