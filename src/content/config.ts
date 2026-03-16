import { defineCollection, z } from 'astro:content';

const chapters = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    lat: z.number(),
    long: z.number(),
    link: z.string().optional(),
  }),
});

const books = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string().optional().default(''),
    image: z.string(),
    imageAlt: z.string(),
    imageWidth: z.number().optional().default(200),
    imageHeight: z.number().optional().default(300),
    imageStyle: z.string().optional().default(''),
    ebookLink: z.string(),
    formats: z.array(z.object({
      label: z.string(),
      link: z.string(),
    })).optional().default([]),
    translations: z.array(z.object({
      language: z.string(),
      link: z.string(),
    })).optional().default([]),
    group: z.enum(['main', 'bonus']).default('main'),
    sortOrder: z.number().default(0),
  }),
});

export const collections = { chapters, books };
