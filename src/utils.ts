import {
  DrugLabel,
  GoogleScholarArticle,
  PubMedArticle,
  RxNormDrug,
  WHOIndicator,
  HealthIndicator,
  AdverseEvent,
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
  WORLD_BANK_API_BASE,
} from "./constants.js";

export type SearchField = 
  | "brand_name"
  | "generic_name" 
  | "active_ingredient"
  | "substance_name"
  | "manufacturer_name"
  | "drug_interactions"
  | "indications_and_usage"
  | "route"
  | "dosage_form";

// Retry helper function for FDA API calls
async function retryFDAApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on client errors (400-499) or certain server errors
      if (error.status && error.status < 500 && error.status !== 429) {
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function searchDrugs(
  query: string,
  limit: number = 10,
  searchField?: SearchField,
): Promise<DrugLabel[]> {
  let searchQuery: string;

  // Build field-specific search query or use general search
  if (searchField) {
    switch (searchField) {
      case "brand_name":
        searchQuery = `openfda.brand_name:${query}`;
        break;
      case "generic_name":
        searchQuery = `openfda.generic_name:${query}`;
        break;
      case "active_ingredient":
      case "substance_name":
        searchQuery = `openfda.substance_name:${query}`;
        break;
      case "manufacturer_name":
        searchQuery = `openfda.manufacturer_name:${query}`;
        break;
      case "drug_interactions":
        searchQuery = `drug_interactions:${query}`;
        break;
      case "indications_and_usage":
        searchQuery = `indications_and_usage:${query}`;
        break;
      case "route":
        searchQuery = `openfda.route:${query}`;
        break;
      case "dosage_form":
        searchQuery = `openfda.dosage_form:${query}`;
        break;
    }
  } else {
    // No specific field - let FDA API search across all fields
    searchQuery = query;
  }

  try {
    return await retryFDAApiCall(async () => {
      const res = await superagent
        .get(`${FDA_API_BASE}/drug/label.json`)
        .query({
          search: searchQuery,
          limit: limit,
        })
        .set("User-Agent", USER_AGENT)
        .timeout({
          response: 30000, // 30 second timeout
          deadline: 60000  // 1 minute total
        });

      return res.body.results || [];
    });

  } catch (error: any) {
    // Throw the error with additional context for the MCP handler to catch
    const contextualError = new Error(`FDA API Error: ${error.message}`);
    (contextualError as any).originalError = error;
    (contextualError as any).context = {
      query,
      searchField,
      searchQuery,
      limit,
      apiUrl: `${FDA_API_BASE}/drug/label.json`,
      retryAttempted: true
    };
    throw contextualError;
  }
}

// Enhanced search function for active ingredients specifically
export async function searchDrugsByActiveIngredient(
  ingredient: string,
  limit: number = 10,
): Promise<DrugLabel[]> {
  try {
    console.log(`[DEBUG] searchDrugsByActiveIngredient called with ingredient: "${ingredient}", limit: ${limit}`);
    
    // Search in substance_name field (active_ingredient may not be searchable directly)
    const searchQuery = `openfda.substance_name:${ingredient}`;
    console.log(`[DEBUG] searchDrugsByActiveIngredient query: "${searchQuery}"`);
    
    const res = await superagent
      .get(`${FDA_API_BASE}/drug/label.json`)
      .query({
        search: searchQuery,
        limit: limit,
      })
      .set("User-Agent", USER_AGENT)
      .timeout({
        response: 30000,
        deadline: 60000
      });

    console.log(`[DEBUG] searchDrugsByActiveIngredient response status: ${res.status}, results: ${res.body?.results?.length || 0}`);
    return res.body.results || [];
  } catch (error: any) {
    console.error(`[ERROR] searchDrugsByActiveIngredient failed:`, {
      message: error.message,
      status: error.status,
      response: error.response?.text || error.response?.body,
      code: error.code
    });
    return [];
  }
}

// Search for drug interactions
export async function searchDrugInteractions(
  drugName: string,
  limit: number = 10,
): Promise<DrugLabel[]> {
  const res = await superagent
    .get(`${FDA_API_BASE}/drug/label.json`)
    .query({
      search: `drug_interactions:${drugName}`,
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

// Health Statistics API functions (using World Bank API)
export async function getHealthIndicators(
  indicatorName: string,
  country?: string,
): Promise<HealthIndicator[]> {
  try {
    // Map common health queries to World Bank indicators
    const healthIndicatorMap: Record<string, { code: string; name: string }> = {
      'life expectancy': { 
        code: 'SP.DYN.LE00.IN', 
        name: 'Life expectancy at birth, total (years)' 
      },
      'mortality rate': { 
        code: 'SP.DYN.IMRT.IN', 
        name: 'Mortality rate, infant (per 1,000 live births)' 
      },
      'infant mortality': { 
        code: 'SP.DYN.IMRT.IN', 
        name: 'Mortality rate, infant (per 1,000 live births)' 
      },
      'birth rate': { 
        code: 'SP.DYN.CBRT.IN', 
        name: 'Birth rate, crude (per 1,000 people)' 
      },
      'death rate': { 
        code: 'SP.DYN.CDRT.IN', 
        name: 'Death rate, crude (per 1,000 people)' 
      },
      'population growth': { 
        code: 'SP.POP.GROW', 
        name: 'Population growth (annual %)' 
      }
    };

    const queryLower = indicatorName.toLowerCase();
    let indicatorInfo = null;
    
    // Find matching indicator
    for (const [keyword, info] of Object.entries(healthIndicatorMap)) {
      if (queryLower.includes(keyword)) {
        indicatorInfo = info;
        break;
      }
    }
    
    // If no predefined mapping found, check if it's a direct World Bank indicator code
    if (!indicatorInfo) {
      if (indicatorName.match(/^[A-Z]{2}\.[A-Z]{2,4}\.[A-Z0-9]{2,8}(\.[A-Z0-9]{2})?$/)) {
        indicatorInfo = { code: indicatorName, name: indicatorName };
      } else {
        return [];
      }
    }

    const countryCode = country || 'all';
    const res = await superagent
      .get(`${WORLD_BANK_API_BASE}/country/${countryCode}/indicator/${indicatorInfo.code}`)
      .query({
        format: 'json',
        per_page: 50,
        date: '2018:2023' // Recent years only
      })
      .set("User-Agent", USER_AGENT)
      .timeout({ response: 15000 });

    if (!res.body || !Array.isArray(res.body) || res.body.length < 2) {
      return [];
    }

    const data = res.body[1] || [];
    
    return data
      .filter((item: any) => item.value !== null)
      .map((item: any) => ({
        country: item.country.value,
        countryCode: item.countryiso3code || item.country.id,
        indicator: item.indicator.value,
        indicatorCode: item.indicator.id,
        year: item.date,
        value: item.value,
        unit: item.unit || '',
        source: 'World Bank' as const
      }));

  } catch (error: any) {
    console.error('Error fetching health indicators from World Bank API:', error.message);
    return [];
  }
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

// FDA Adverse Events API functions
export async function searchAdverseEvents(
  query: string,
  searchField: string = "reactionmeddrapt",
  limit: number = 10,
): Promise<AdverseEvent[]> {
  try {
    let searchQuery: string;
    
    if (searchField === "medicinalproduct") {
      searchQuery = `patient.drug.medicinalproduct:${query}`;
    } else {
      searchQuery = `patient.reaction.${searchField}:${query}`;
    }
    
    return await retryFDAApiCall(async () => {
      const res = await superagent
        .get(`${FDA_API_BASE}/drug/event.json`)
        .query({
          search: searchQuery,
          limit: limit,
        })
        .set("User-Agent", USER_AGENT)
        .timeout({
          response: 30000,
          deadline: 60000
        });

      return res.body.results || [];
    });
  } catch (error) {
    return [];
  }
}

export async function searchAdverseEventsByDrug(
  drugName: string,
  limit: number = 10,
): Promise<AdverseEvent[]> {
  try {
    // Search for adverse events by drug name (medicinal product)
    const searchQuery = `patient.drug.medicinalproduct:${drugName}`;
    
    const res = await superagent
      .get(`${FDA_API_BASE}/drug/event.json`)
      .query({
        search: searchQuery,
        limit: limit,
      })
      .set("User-Agent", USER_AGENT);

    return res.body.results || [];
  } catch (error) {
    return [];
  }
}

export async function searchAdverseEventsByReaction(
  reaction: string,
  limit: number = 10,
): Promise<AdverseEvent[]> {
  try {
    // Search for adverse events by reaction type using MedDRA preferred terms
    const searchQuery = `patient.reaction.reactionmeddrapt:${reaction}`;
    
    const res = await superagent
      .get(`${FDA_API_BASE}/drug/event.json`)
      .query({
        search: searchQuery,
        limit: limit,
      })
      .set("User-Agent", USER_AGENT);

    return res.body.results || [];
  } catch (error) {
    return [];
  }
}

export async function getSeriousAdverseEvents(
  drugName?: string,
  limit: number = 10,
): Promise<AdverseEvent[]> {
  try {
    let searchQuery = "serious:1";
    
    if (drugName) {
      searchQuery += `+AND+patient.drug.medicinalproduct:${drugName}`;
    }
    
    const res = await superagent
      .get(`${FDA_API_BASE}/drug/event.json`)
      .query({
        search: searchQuery,
        limit: limit,
      })
      .set("User-Agent", USER_AGENT);

    return res.body.results || [];
  } catch (error) {
    return [];
  }
}
