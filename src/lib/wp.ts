// src/lib/wp.ts

/**
 * WPGraphQLのエンドポイントに対してリクエストを送信する共通関数です。
 */
export async function fetchAPI(
  query: string,
  { variables }: { variables?: any } = {},
) {
  let wpUrl = import.meta.env.PUBLIC_WP_GRAPHQL_URL;
  if (!wpUrl) return {};
  if (!wpUrl.endsWith("/")) wpUrl += "/";

  const headers = {
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  try {
    const res = await fetch(wpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (json.errors) {
        console.error("GraphQL Error:", json.errors);
        return {};
      }
      return json.data;
    } catch (e) {
      console.error("JSON Parse Error");
      return {};
    }
  } catch (e) {
    console.error("Network Error:", e);
    return {};
  }
}

/**
 * ギャラリーの初期表示に必要な全データを取得します。
 */
export async function getGalleryData() {
  const data = await fetchAPI(`
    query GetGalleryData {
      generalSettings {
        title
        description
      }
      # ▼ スライダーの順番は管理画面の順（MENU_ORDER）
      sliders(first: 10, where: { orderby: { field: MENU_ORDER, order: ASC } }) {
        nodes {
          title
          featuredImage { node { sourceUrl } }
        }
      }
      # ▼ モデルは元のプラグイン仕様（TERM_ORDER）に戻す
      models(first: 20, where: { orderby: TERM_ORDER }) {
        nodes {
          id
          name
          slug
          modelAvatar { node { sourceUrl } }
          modelBio
          artworks(first: 10, where: { orderby: { field: DATE, order: DESC } }) {
            nodes {
              id
              databaseId
              title
              slug
              featuredImage { node { sourceUrl altText } }
              promptData
              orderedImages { sourceUrl }
              likeCount
              guestComments {
                id
                parentId
                author
                content
                date
              }
            }
          }
        }
      }
    }
  `);

  return {
    siteInfo: data?.generalSettings || { title: "Gallery", description: "" },
    sliders: data?.sliders?.nodes || [],
    models: data?.models?.nodes || [],
  };
}
