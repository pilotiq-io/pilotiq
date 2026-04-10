import { Rudder } from '@rudderjs/rudder'
import { User } from '../app/Models/User.js'
import { Category } from '../app/Models/Category.js'

Rudder.command('db:seed', async () => {
  console.log('Seeding database...')

  await User.create({ name: 'Alice',   email: 'alice2@example.com',   role: 'admin' })
  await User.create({ name: 'Bob',     email: 'bob2@example.com',     role: 'user'  })
  await User.create({ name: 'Charlie', email: 'charlie2@example.com', role: 'user'  })

  const tech       = await Category.create({ name: 'Technology',   slug: 'technology',   icon: 'cpu',           position: 0 })
  const design     = await Category.create({ name: 'Design',       slug: 'design',       icon: 'palette',       position: 1 })
  const business   = await Category.create({ name: 'Business',     slug: 'business',     icon: 'briefcase',     position: 2 })
  await Category.create({ name: 'Frontend',      slug: 'frontend',      icon: 'layout',        position: 0, parentId: tech.id })
  await Category.create({ name: 'Backend',       slug: 'backend',       icon: 'server',        position: 1, parentId: tech.id })
  await Category.create({ name: 'DevOps',        slug: 'devops',        icon: 'terminal',      position: 2, parentId: tech.id })
  await Category.create({ name: 'UI Design',     slug: 'ui-design',     icon: 'figma',         position: 0, parentId: design.id })
  await Category.create({ name: 'Typography',    slug: 'typography',    icon: 'type',          position: 1, parentId: design.id })
  await Category.create({ name: 'Marketing',     slug: 'marketing',     icon: 'megaphone',     position: 0, parentId: business.id })
  await Category.create({ name: 'Finance',       slug: 'finance',       icon: 'dollar-sign',   position: 1, parentId: business.id })

  console.log('Done. 3 users + 10 categories seeded.')
}).description('Seed the database with sample data')
