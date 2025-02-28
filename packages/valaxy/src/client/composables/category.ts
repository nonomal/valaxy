import type { Post } from 'valaxy'
import { usePostList } from './post'

export interface ParentCategory {
  total: number
  children: Categories
}

export interface PostCategory {
  total: number
  posts: Post[]
}

export type Category = ParentCategory | PostCategory

// export type Categories = Map<string, Post[] | Category>
export type Categories = Map<string, Category>

/**
 * get categories from posts
 * @returns
 */
export function useCategory() {
  const posts = usePostList()

  const categoryMap: Category = {
    total: posts.value.length,
    children: new Map([
      ['Uncategorized', { total: 0, posts: [] }],
    ]),
  }

  const uncategorized = categoryMap.children.get('Uncategorized') as PostCategory

  posts.value.forEach((post) => {
    if (post.categories) {
      if (Array.isArray(post.categories)) {
        const len = post.categories.length

        let c: ParentCategory = categoryMap
        post.categories.forEach((category, i) => {
          if (i === len - 1) {
            if (c.children.has(category)) {
              const cur = c.children.get(category) as PostCategory
              if (cur.posts) {
                cur.total += 1
                cur.posts!.push(post)
              }
            }
            else {
              c.children?.set(category, {
                total: 1,
                posts: [post],
              })
            }
          }
          else {
            if (c.children?.has(category)) {
              const cur = c.children.get(category) as ParentCategory
              cur.total += 1
              c = cur
            }
            else {
              const temp = {
                total: 1,
                children: new Map(),
              }
              c.children?.set(category, temp)
              c = temp
            }
          }
        })
      }
      else {
        // for string
        const category = post.categories
        if (categoryMap.children.has(category)) {
          const cur = categoryMap.children.get(category) as PostCategory
          cur.total += 1
          cur.posts.push(post)
        }
        else {
          categoryMap.children.set(category, {
            total: 1,
            posts: [post],
          })
        }
      }
    }
    else {
      uncategorized.total += 1
      uncategorized.posts.push(post)
    }
  })

  // clear uncategorized
  if (uncategorized!.total === 0)
    categoryMap.children?.delete('Uncategorized')

  return categoryMap
}
