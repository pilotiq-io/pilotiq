import { Seeder } from '@rudderjs/orm'
import { User } from '../../app/Models/User.js'
import { Category } from '../../app/Models/Category.js'
import { Post } from '../../app/Models/Post.js'
import { Page } from '../../app/Models/Page.js'
import { Comment } from '../../app/Models/Comment.js'

/**
 * Demo CMS content — users, categories, pages, posts (with authors /
 * categories / related-posts pivots) and comments. Run via
 * `pnpm rudder db:seed` (or `migrate:fresh --seed`).
 *
 * Dates are ISO strings — better-sqlite3 can't bind Date objects.
 * Tiptap documents are stored JSON-encoded.
 */
export default class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    if (await User.count() > 0) {
      console.log('  Database already seeded — skipping.')
      return
    }

    // ── Users ──────────────────────────────────────────────
    // `demo-admin` matches the panel's resolved user (AdminPanel.user()),
    // so the profile page and bell notifications hit a real row.
    const admin = await User.create({
      id: 'demo-admin', name: 'Demo Admin', email: 'admin@example.com', role: 'admin',
    })
    const maya  = await User.create({ name: 'Maya Lindholm',  email: 'maya@example.com',  role: 'user' })
    const tariq = await User.create({ name: 'Tariq Haddad',   email: 'tariq@example.com', role: 'user' })
    const june  = await User.create({ name: 'June Park',      email: 'june@example.com',  role: 'user' })
    const writers = [admin, maya, tariq, june]

    // ── Categories ─────────────────────────────────────────
    const categories = []
    for (const [name, description] of [
      ['Engineering', 'Deep dives, postmortems, and how we build.'],
      ['Product',     'Feature announcements and roadmap notes.'],
      ['Design',      'Interface decisions and design systems.'],
      ['Company',     'News, hiring, and culture.'],
    ] as const) {
      categories.push(await Category.create({
        name, slug: slugify(name), description,
      }))
    }

    // ── Pages ──────────────────────────────────────────────
    for (const [title, published, body] of [
      ['About',   true,  'We build a schema-driven admin runtime for the Node.js ecosystem.'],
      ['Contact', true,  'Reach us at hello@example.com — we answer within a business day.'],
      ['Privacy', false, 'Draft privacy policy. Not published yet.'],
    ] as const) {
      await Page.create({
        title,
        slug:      slugify(title),
        content:   JSON.stringify(doc(body)),
        published,
      })
    }

    // ── Posts ──────────────────────────────────────────────
    const specs: Array<{
      title: string; status: 'draft' | 'published' | 'archived'
      daysAgo: number; categories: number[]; authors: typeof writers
      paragraphs: string[]
    }> = [
      { title: 'Hello, world — the blog is live', status: 'published', daysAgo: 21,
        categories: [3], authors: [admin],
        paragraphs: ['Welcome to the demo blog. Everything you see here was created through the admin panel.',
                     'Posts support rich text, cover images, co-authors, categories, and related posts.'] },
      { title: 'How we model content with a schema-driven panel', status: 'published', daysAgo: 17,
        categories: [0], authors: [maya, admin],
        paragraphs: ['Resources declare their form and table once; the panel renders list, create, edit, and view pages from the same schema.',
                     'The post you are reading is a row in a sqlite database, edited through a Tiptap document field.'] },
      { title: 'Designing the editor toolbar', status: 'published', daysAgo: 14,
        categories: [2], authors: [june],
        paragraphs: ['A toolbar earns its place one button at a time. We started from zero and added affordances only when a real document needed them.'] },
      { title: 'Roadmap: what ships this quarter', status: 'published', daysAgo: 10,
        categories: [1, 3], authors: [tariq],
        paragraphs: ['Multi-select relationship fields, a friendlier seeder story, and a simpler starter playground.',
                     'Follow along — we publish progress notes every other week.'] },
      { title: 'Postmortem: the slug collision of last Tuesday', status: 'published', daysAgo: 7,
        categories: [0], authors: [maya],
        paragraphs: ['Two posts, one slug, zero validation. Here is what went wrong and the unique() rule that prevents it now.'] },
      { title: 'Why related posts beat tag clouds', status: 'published', daysAgo: 5,
        categories: [1, 2], authors: [june, maya],
        paragraphs: ['Hand-picked related posts keep readers in context far better than algorithmic tag matches.'] },
      { title: 'Co-authoring posts without merge conflicts', status: 'published', daysAgo: 2,
        categories: [0], authors: [admin, tariq],
        paragraphs: ['Authors are a many-to-many pivot — any post can carry several bylines, and any writer can co-own several posts.'] },
      { title: 'Draft: the case for boring technology', status: 'draft', daysAgo: 1,
        categories: [0], authors: [tariq],
        paragraphs: ['Half-written argument. Sqlite, server rendering, and a single process get you surprisingly far.'] },
      { title: 'Draft: interviewing your admin panel', status: 'draft', daysAgo: 0,
        categories: [1], authors: [maya],
        paragraphs: ['Outline only.'] },
      { title: 'Archived: the old launch announcement', status: 'archived', daysAgo: 30,
        categories: [3], authors: [admin],
        paragraphs: ['Superseded by the new hello-world post. Kept for the archive tab.'] },
    ]

    const posts = []
    for (const spec of specs) {
      const created = isoDaysAgo(spec.daysAgo)
      const post = await Post.create({
        title:           spec.title,
        slug:            slugify(spec.title),
        status:          spec.status,
        publishedAt:     spec.status === 'published' ? created : null,
        content:         JSON.stringify(doc(...spec.paragraphs)),
        metaTitle:       spec.status === 'published' ? spec.title : null,
        metaDescription: spec.status === 'published' ? spec.paragraphs[0]!.slice(0, 150) : null,
        createdAt:       created,
        updatedAt:       created,
      })
      await (post as any).authors().attach(spec.authors.map(u => u.id))
      await (post as any).categories().attach(spec.categories.map(i => categories[i]!.id))
      posts.push(post)
    }

    // Related posts — wire a few hand-picked pairs (self M2M pivot).
    await (posts[1] as any).relatedPosts().attach([posts[4]!.id, posts[6]!.id])
    await (posts[3] as any).relatedPosts().attach([posts[5]!.id])
    await (posts[5] as any).relatedPosts().attach([posts[1]!.id])

    // ── Comments ───────────────────────────────────────────
    const commentSpecs: Array<[number, string, string]> = [
      [0, 'Ada',    'Congrats on the launch! 🎉'],
      [0, 'Robin',  'Looking forward to the engineering posts.'],
      [1, 'Sam',    'The schema-driven approach really clicks once you see list + form share one definition.'],
      [1, 'Priya',  'How do you handle migrations for the content column?'],
      [3, 'Robin',  'Multi-select relationship fields — finally!'],
      [4, 'Ada',    'We hit the same slug bug last year. unique() with ignoreRecord is the way.'],
      [5, 'Noor',   'Hand-picked related posts doubled our session depth.'],
      [6, 'Sam',    'Does each co-author get notified on publish?'],
    ]
    for (const [idx, authorName, body] of commentSpecs) {
      await Comment.create({ postId: posts[idx]!.id, authorName, body })
    }

    console.log(`  Seeded ${writers.length} users, ${categories.length} categories, 3 pages, ${posts.length} posts, ${commentSpecs.length} comments.`)
  }
}

/** Minimal Tiptap document — one paragraph node per string. */
function doc(...paragraphs: string[]) {
  return {
    type: 'doc',
    content: paragraphs.map(text => ({
      type:    'paragraph',
      content: [{ type: 'text', text }],
    })),
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}
