import { config, fields, collection, singleton } from '@keystatic/core';

export default config({
  storage: { kind: 'local' },

  collections: {
    chapters: collection({
      label: 'Chapters',
      slugField: 'name',
      path: 'src/content/chapters/*',
      format: { data: 'json' },
      schema: {
        name: fields.slug({ name: { label: 'Chapter Name' } }),
        lat: fields.number({ label: 'Latitude', validation: { isRequired: true } }),
        long: fields.number({ label: 'Longitude', validation: { isRequired: true } }),
        link: fields.url({ label: 'Chapter Link' }),
      },
    }),

    books: collection({
      label: 'Books',
      slugField: 'title',
      path: 'src/content/books/*',
      format: { data: 'json' },
      columns: ['group', 'sortOrder'],
      schema: {
        title: fields.slug({ name: { label: 'Book Title' } }),
        description: fields.text({ label: 'Description', multiline: true }),
        image: fields.text({ label: 'Cover Image Path', description: 'e.g. /images/greenpill-cover.png' }),
        imageAlt: fields.text({ label: 'Image Alt Text' }),
        imageWidth: fields.number({ label: 'Image Width', defaultValue: 200 }),
        imageHeight: fields.number({ label: 'Image Height', defaultValue: 300 }),
        imageStyle: fields.text({ label: 'Image Style (optional)', description: 'Inline CSS, e.g. border: 1px solid var(--yellow)' }),
        ebookLink: fields.text({ label: 'Ebook PDF Path', description: 'e.g. /pdf/green-pill.pdf' }),
        formats: fields.array(
          fields.object({
            label: fields.text({ label: 'Format Label', description: 'e.g. Softcover, Hardcover, Audiobook' }),
            link: fields.text({ label: 'Format Link' }),
          }),
          { label: 'Additional Formats', itemLabel: (props) => props.fields.label.value },
        ),
        translations: fields.array(
          fields.object({
            language: fields.text({ label: 'Language' }),
            link: fields.text({ label: 'Translation PDF Path' }),
          }),
          { label: 'Translations', itemLabel: (props) => props.fields.language.value },
        ),
        group: fields.select({
          label: 'Book Group',
          options: [
            { label: 'Main', value: 'main' },
            { label: 'Bonus', value: 'bonus' },
          ],
          defaultValue: 'main',
        }),
        sortOrder: fields.number({ label: 'Sort Order', defaultValue: 0 }),
      },
    }),
  },

  singletons: {
    siteSettings: singleton({
      label: 'Site Settings',
      path: 'src/content/site-settings',
      format: { data: 'json' },
      schema: {
        title: fields.text({ label: 'Site Title', validation: { isRequired: true } }),
        description: fields.text({ label: 'Site Description', multiline: true }),
        ogImage: fields.text({ label: 'OG Image URL' }),
        analyticsId: fields.text({ label: 'Google Analytics ID' }),
      },
    }),

    podcast: singleton({
      label: 'Podcast',
      path: 'src/content/podcast',
      format: { data: 'json' },
      schema: {
        title: fields.text({ label: 'Section Title' }),
        description: fields.text({ label: 'Description', multiline: true }),
        secondaryDescription: fields.text({ label: 'Secondary Description', multiline: true }),
        listenLink: fields.url({ label: 'Listen Anywhere URL' }),
        youtubeLink: fields.url({ label: 'YouTube URL' }),
        guestRecommendLink: fields.url({ label: 'Recommend Guest URL' }),
        coverImage: fields.text({ label: 'Cover Image Path' }),
      },
    }),

    socialLinks: singleton({
      label: 'Social Links',
      path: 'src/content/social-links',
      format: { data: 'json' },
      schema: {
        discord: fields.url({ label: 'Discord' }),
        charmverse: fields.url({ label: 'Charmverse' }),
        charmverseInvite: fields.url({ label: 'Charmverse Invite' }),
        twitter: fields.url({ label: 'Twitter/X' }),
        twitterList: fields.url({ label: 'Twitter Chapter List' }),
        telegram: fields.url({ label: 'Telegram' }),
        warpcast: fields.url({ label: 'Warpcast' }),
        hub: fields.url({ label: 'Hub' }),
        youtube: fields.url({ label: 'YouTube' }),
      },
    }),
  },
});
