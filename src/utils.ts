import {
  DrugLabel,
  GoogleScholarArticle,
  PubMedArticle,
  RxNormDrug,
  WHOIndicator,
} from "./types.js";
import superagent from "superagent";
import puppeteer from "puppeteer";
import {
  FDA_API_BASE,
  GOOGLE_SCHOLAR_API_BASE,
  PUBMED_API_BASE,
  RXNAV_API_BASE,
  USER_AGENT,
  WHO_API_BASE,
} from "./constants.js";

export async function searchDrugs(
  query: string,
  limit: number = 10,
): Promise<DrugLabel[]> {
  const res = await superagent
    .get(`${FDA_API_BASE}/drug/label.json`)
    .query({
      search: `openfda.brand_name:${query}`,
      limit: limit,
    })
    .set("User-Agent", USER_AGENT);

  return res.body.results || [];
}

export async function getDrugByNDC(ndc: string): Promise<DrugLabel | null> {
  try {
    const res = await superagent
      .get(`${FDA_API_BASE}/drug/label.json`)
      .query({
        search: `openfda.product_ndc:${ndc}`,
        limit: 1,
      })
      .set("User-Agent", USER_AGENT);

    return res.body.results?.[0] || null;
  } catch (error) {
    return null;
  }
}

// WHO API functions
export async function getHealthIndicators(
  indicatorName: string,
  country?: string,
): Promise<WHOIndicator[]> {
  let filter = `IndicatorName eq '${indicatorName}'`;
  if (country) {
    filter += ` and SpatialDim eq '${country}'`;
  }

  const res = await superagent
    .get(`${WHO_API_BASE}/Indicator`)
    .query({
      $filter: filter,
      $format: "json",
    })
    .set("User-Agent", USER_AGENT);

  return res.body.value || [];
}

// RxNorm API functions
export async function searchRxNormDrugs(query: string): Promise<RxNormDrug[]> {
  try {
    const res = await superagent
      .get(`${RXNAV_API_BASE}/drugs.json`)
      .query({ name: query })
      .set("User-Agent", USER_AGENT);

    return res.body.drugGroup?.conceptGroup?.[0]?.concept || [];
  } catch (error) {
    return [];
  }
}

// Utility function to add random delay
function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.random() * (max - min) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// Google Scholar API functions
export async function searchGoogleScholar(
  query: string,
): Promise<GoogleScholarArticle[]> {
  let browser;
  try {
    // Add a small random delay to avoid rate limiting
    await randomDelay(1000, 3000);

    // Launch browser with stealth settings
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ],
    });

    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // Add extra headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    });

    // Navigate to Google Scholar
    const searchUrl = `${GOOGLE_SCHOLAR_API_BASE}?q=${encodeURIComponent(query)}&hl=en`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for results to load with multiple possible selectors
    try {
      await page.waitForSelector(".gs_r, .gs_ri", { timeout: 15000 });
    } catch (error) {
      // If no results found, check if there's a "no results" message
      const noResults = await page.$(".gs_r");
      if (!noResults) {
        throw new Error("No search results found or page structure changed");
      }
    }

    return await page.evaluate(() => {
      const results: GoogleScholarArticle[] = [];
      // Try multiple selectors for different Google Scholar layouts
      const articleElements = document.querySelectorAll(
        ".gs_r, .gs_ri, [data-rp]",
      );

      articleElements.forEach((element) => {
        // Try multiple selectors for title
        const titleElement =
          element.querySelector(".gs_rt a, .gs_rt, h3 a, h3") ||
          element.querySelector("a[data-clk]") ||
          element.querySelector("h3");
        const title = titleElement?.textContent?.trim() || "";
        const url = (titleElement as HTMLAnchorElement)?.href || "";

        // Try multiple selectors for authors/venue
        const authorsElement =
          element.querySelector(".gs_a, .gs_authors, .gs_venue") ||
          element.querySelector('[class*="author"]') ||
          element.querySelector('[class*="venue"]');
        const authors = authorsElement?.textContent?.trim() || "";

        // Try multiple selectors for abstract
        const abstractElement =
          element.querySelector(".gs_rs, .gs_rs_a, .gs_snippet") ||
          element.querySelector('[class*="snippet"]') ||
          element.querySelector('[class*="abstract"]');
        const abstract = abstractElement?.textContent?.trim() || "";

        // Try multiple selectors for citations
        const citationsElement =
          element.querySelector(".gs_fl a, .gs_fl") ||
          element.querySelector('[class*="citation"]') ||
          element.querySelector('a[href*="cites"]');
        const citations = citationsElement?.textContent?.trim() || "";

        // Extract year from various sources
        let year = "";
        const yearMatch =
          authors.match(/(\d{4})/) ||
          title.match(/(\d{4})/) ||
          abstract.match(/(\d{4})/);
        if (yearMatch) {
          year = yearMatch[1];
        }

        // Extract journal from authors string or other sources
        let journal = "";
        const journalMatch =
          authors.match(/- ([^-]+)$/) ||
          authors.match(/, ([^,]+)$/) ||
          authors.match(/in ([^,]+)/);
        if (journalMatch) {
          journal = journalMatch[1].trim();
        }

        if (title && title.length > 5) {
          // Only include if title is substantial
          results.push({
            title,
            authors,
            abstract,
            journal,
            year,
            citations,
            url,
          });
        }
      });

      return results;
    });
  } catch (error) {
    console.error("Error scraping Google Scholar:", error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function searchPubMedArticles(
  query: string,
  maxResults: number = 10,
): Promise<PubMedArticle[]> {
  try {
    // First, search for article IDs
    const searchRes = await superagent
      .get(`${PUBMED_API_BASE}/esearch.fcgi`)
      .query({
        db: "pubmed",
        term: query,
        retmode: "json",
        retmax: maxResults,
      })
      .set("User-Agent", USER_AGENT);

    const idList = searchRes.body.esearchresult?.idlist || [];

    if (idList.length === 0) return [];

    // Then, fetch article details
    const fetchRes = await superagent
      .get(`${PUBMED_API_BASE}/efetch.fcgi`)
      .query({
        db: "pubmed",
        id: idList.join(","),
        retmode: "xml",
      })
      .set("User-Agent", USER_AGENT);

    // Parse XML response
    const articles: PubMedArticle[] = [];
    const xmlText = fetchRes.text;

    // Extract PubmedArticle blocks
    const articleBlocks = xmlText.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

    for (const block of articleBlocks) {
      const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      const titleMatch = block.match(/<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/);
      
      // Extract abstract from AbstractText elements
      const abstractMatches = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g) || [];
      let abstract = "";
      
      if (abstractMatches.length > 0) {
        const abstractParts = abstractMatches.map(match => {
          const labelMatch = match.match(/Label="([^"]*?)"/);
          const textMatch = match.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
          const label = labelMatch ? labelMatch[1] : "";
          const text = textMatch ? textMatch[1].trim() : "";
          return label ? `${label}: ${text}` : text;
        });
        abstract = abstractParts.join(" ");
      }

      // Extract authors
      const authorMatches = block.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) || [];
      const authors = authorMatches.map(authorBlock => {
        const lastNameMatch = authorBlock.match(/<LastName>([^<]+)<\/LastName>/);
        const firstNameMatch = authorBlock.match(/<ForeName>([^<]+)<\/ForeName>/);
        const lastName = lastNameMatch ? lastNameMatch[1] : "";
        const firstName = firstNameMatch ? firstNameMatch[1] : "";
        return firstName ? `${firstName} ${lastName}` : lastName;
      }).filter(name => name);

      // Extract journal
      const journalMatch = block.match(/<Title>([^<]+)<\/Title>/);
      const journal = journalMatch ? journalMatch[1] : "Journal information not available";

      // Extract publication date
      const pubDateMatch = block.match(/<PubDate>[\s\S]*?<\/PubDate>/);
      let publicationDate = "Date not available";
      if (pubDateMatch) {
        const yearMatch = pubDateMatch[0].match(/<Year>(\d{4})<\/Year>/);
        const monthMatch = pubDateMatch[0].match(/<Month>([^<]+)<\/Month>/);
        if (yearMatch) {
          publicationDate = monthMatch ? `${monthMatch[1]} ${yearMatch[1]}` : yearMatch[1];
        }
      }

      const pmid = pmidMatch ? pmidMatch[1] : "";
      const title = titleMatch ? titleMatch[1] : "";

      if (pmid && title) {
        articles.push({
          pmid,
          title,
          abstract: abstract || "Abstract not available",
          authors,
          journal,
          publication_date: publicationDate,
        });
      }
    }

    return articles;
  } catch (error) {
    return [];
  }
}
