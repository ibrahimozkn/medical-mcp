import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getDrugByNDC,
  getHealthIndicators,
  searchDrugs,
  searchDrugsByActiveIngredient,
  searchDrugInteractions,
  searchPubMedArticles,
  searchRxNormDrugs,
  searchGoogleScholar,
  searchAdverseEvents,
  searchAdverseEventsByDrug,
  searchAdverseEventsByReaction,
  getSeriousAdverseEvents,
  SearchField,
} from "./utils.js";
import { FDA_API_BASE, USER_AGENT } from "./constants.js";

const server = new McpServer({
  name: "medical-mcp",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// MCP Tools
server.tool(
  "search-drugs",
  "Search for drug information using FDA database with enhanced search capabilities",
  {
    query: z
      .string()
      .describe("Drug name, active ingredient, or search term"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (max 50)"),
    search_field: z
      .enum([
        "brand_name",
        "generic_name", 
        "active_ingredient",
        "substance_name",
        "manufacturer_name",
        "drug_interactions",
        "indications_and_usage",
        "route",
        "dosage_form"
      ])
      .optional()
      .describe("Specific field to search in (optional - if not provided, searches across all fields)"),
  },
  async ({ query, limit, search_field }) => {
    try {
      const drugs = await searchDrugs(query, limit, search_field as SearchField);

      if (drugs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No drugs found matching "${query}" in ${search_field || "any field"}. Try a different search term or field.`,
            },
          ],
        };
      }

      let result = `**Drug Search Results for "${query}"**\n`;
      result += `Search Field: ${search_field || "Multiple fields"}\n`;
      result += `Found ${drugs.length} drug(s)\n\n`;

      drugs.forEach((drug, index) => {
        result += `${index + 1}. **${drug.openfda.brand_name?.[0] || "Unknown Brand"}**\n`;
        result += `   Generic Name: ${drug.openfda.generic_name?.join(", ") || "Not specified"}\n`;
        result += `   Manufacturer: ${drug.openfda.manufacturer_name?.[0] || "Not specified"}\n`;
        result += `   Route: ${drug.openfda.route?.join(", ") || "Not specified"}\n`;
        result += `   Dosage Form: ${drug.openfda.dosage_form?.join(", ") || "Not specified"}\n`;

        // Show active ingredients if available
        if (drug.active_ingredient && drug.active_ingredient.length > 0) {
          result += `   Active Ingredients: ${drug.active_ingredient.slice(0, 3).join(", ")}${drug.active_ingredient.length > 3 ? "..." : ""}\n`;
        } else if (drug.openfda.substance_name && drug.openfda.substance_name.length > 0) {
          result += `   Active Substances: ${drug.openfda.substance_name.slice(0, 3).join(", ")}${drug.openfda.substance_name.length > 3 ? "..." : ""}\n`;
        }

        if (drug.purpose && drug.purpose.length > 0) {
          result += `   Purpose: ${drug.purpose[0].substring(0, 200)}${drug.purpose[0].length > 200 ? "..." : ""}\n`;
        }

        if (drug.indications_and_usage && drug.indications_and_usage.length > 0) {
          result += `   Indications: ${drug.indications_and_usage[0].substring(0, 200)}${drug.indications_and_usage[0].length > 200 ? "..." : ""}\n`;
        }

        result += `   Last Updated: ${drug.effective_time}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      const originalError = error.originalError || error;
      const context = error.context || {};
      
      const debugInfo = `
🔍 DEBUG INFO:
- Query: "${query}"
- Search Field: "${search_field}" 
- Limit: ${limit}
- FDA API Base: ${FDA_API_BASE}
- User Agent: ${USER_AGENT}
- Node Environment: ${process.env.NODE_ENV || 'unknown'}
- Docker Container: ${process.env.HOSTNAME || 'unknown'}

📋 ERROR DETAILS:
- Error Type: ${originalError.constructor.name}
- Error Message: ${originalError.message}
- HTTP Status: ${originalError.status || 'N/A'}
- Error Code: ${originalError.code || 'N/A'} 
- System Call: ${originalError.syscall || 'N/A'}
- Error Number: ${originalError.errno || 'N/A'}
- Target Hostname: ${originalError.hostname || 'N/A'}

🌐 NETWORK DIAGNOSTICS:
- Can resolve DNS? ${originalError.code === 'ENOTFOUND' ? '❌ NO' : '✅ Likely yes'}
- Network timeout? ${originalError.code === 'ETIMEDOUT' ? '❌ YES' : '✅ No timeout detected'}
- Connection refused? ${originalError.code === 'ECONNREFUSED' ? '❌ YES' : '✅ No connection issues'}
- Docker network issue? ${originalError.code === 'ENOTFOUND' && process.env.HOSTNAME ? '⚠️ POSSIBLE' : 'Unlikely'}

💡 SUGGESTIONS:
${originalError.code === 'ENOTFOUND' ? '• Check Docker DNS settings and external network access\n• Verify FDA API is accessible from container\n• Consider using --network=host for testing' : ''}
${originalError.status >= 500 ? '• FDA API server error (automatic retry attempted)\n• FDA API can be unstable - try again in a few minutes\n• Check FDA API status at https://api.fda.gov' : ''}
${originalError.status === 400 ? '• Invalid search query format\n• Check search parameters and field names' : ''}
${originalError.status === 429 ? '• Rate limit exceeded - automatic retry with backoff attempted\n• Wait a few minutes before trying again' : ''}
      `;
      
      // Check if this is a persistent FDA API outage
      const isApiOutage = originalError.status >= 500 && error.context?.retryAttempted;
      
      let fallbackMessage = "";
      if (isApiOutage) {
        fallbackMessage = `\n\n🔄 **FDA API OUTAGE DETECTED**\n` +
          `The FDA API is currently experiencing server issues (HTTP ${originalError.status}). ` +
          `This is a temporary problem on the FDA's end, not an issue with your Docker setup.\n\n` +
          `**Alternative Options:**\n` +
          `• Try again in 15-30 minutes\n` +
          `• Use RxNorm API instead: \`search-rxnorm-drugs\` tool\n` +
          `• Search PubMed for drug information: \`search-pubmed-articles\` tool\n` +
          `• Check FDA API status: https://api.fda.gov/\n\n` +
          `**What we tried:**\n` +
          `• Automatic retry with exponential backoff (3 attempts)\n` +
          `• Extended timeouts (60 seconds total)\n` +
          `• Multiple API endpoints tested\n\n` +
          `The issue is definitely with the FDA API servers, not your configuration.`;
      }
      
      return {
        content: [
          {
            type: "text",
            text: `❌ Error searching drugs: ${error.message}${fallbackMessage}\n\n${debugInfo}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-drugs-by-ingredient",
  "Search for all drugs containing a specific active ingredient",
  {
    ingredient: z
      .string()
      .describe("Active ingredient name (e.g., 'ibuprofen', 'acetaminophen')"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (max 50)"),
  },
  async ({ ingredient, limit }) => {
    try {
      const drugs = await searchDrugsByActiveIngredient(ingredient, limit);

      if (drugs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No drugs found containing the active ingredient "${ingredient}". Try checking the spelling or using a different ingredient name.`,
            },
          ],
        };
      }

      let result = `**Drugs Containing Active Ingredient: "${ingredient}"**\n\n`;
      result += `Found ${drugs.length} drug(s)\n\n`;

      drugs.forEach((drug, index) => {
        result += `${index + 1}. **${drug.openfda.brand_name?.[0] || "Unknown Brand"}**\n`;
        result += `   Generic Name: ${drug.openfda.generic_name?.join(", ") || "Not specified"}\n`;
        result += `   Manufacturer: ${drug.openfda.manufacturer_name?.[0] || "Not specified"}\n`;
        
        if (drug.active_ingredient && drug.active_ingredient.length > 0) {
          result += `   Active Ingredients: ${drug.active_ingredient.join(", ")}\n`;
        }
        
        if (drug.openfda.substance_name && drug.openfda.substance_name.length > 0) {
          result += `   Active Substances: ${drug.openfda.substance_name.join(", ")}\n`;
        }

        result += `   Route: ${drug.openfda.route?.join(", ") || "Not specified"}\n`;
        result += `   Dosage Form: ${drug.openfda.dosage_form?.join(", ") || "Not specified"}\n`;

        if (drug.indications_and_usage && drug.indications_and_usage.length > 0) {
          result += `   Indications: ${drug.indications_and_usage[0].substring(0, 200)}${drug.indications_and_usage[0].length > 200 ? "..." : ""}\n`;
        }

        result += `   Last Updated: ${drug.effective_time}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching drugs by ingredient: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-drug-interactions",
  "Search for drugs that have interactions with a specific drug",
  {
    drug_name: z
      .string()
      .describe("Drug name to check interactions for"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (max 50)"),
  },
  async ({ drug_name, limit }) => {
    try {
      const drugs = await searchDrugInteractions(drug_name, limit);

      if (drugs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No drugs found with documented interactions with "${drug_name}". This could mean:\n- No interactions are documented\n- The drug name might need different spelling\n- Try searching by active ingredient instead`,
            },
          ],
        };
      }

      let result = `**Drugs with Interactions Mentioning: "${drug_name}"**\n\n`;
      result += `Found ${drugs.length} drug(s) with documented interactions\n\n`;

      drugs.forEach((drug, index) => {
        result += `${index + 1}. **${drug.openfda.brand_name?.[0] || "Unknown Brand"}**\n`;
        result += `   Generic Name: ${drug.openfda.generic_name?.join(", ") || "Not specified"}\n`;
        result += `   Manufacturer: ${drug.openfda.manufacturer_name?.[0] || "Not specified"}\n`;

        if (drug.drug_interactions && drug.drug_interactions.length > 0) {
          result += `   Drug Interactions:\n`;
          drug.drug_interactions.forEach((interaction, idx) => {
            if (idx < 2) { // Show first 2 interactions
              result += `   • ${interaction.substring(0, 300)}${interaction.length > 300 ? "..." : ""}\n`;
            }
          });
          if (drug.drug_interactions.length > 2) {
            result += `   • ... and ${drug.drug_interactions.length - 2} more interactions\n`;
          }
        }

        result += `   Last Updated: ${drug.effective_time}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching drug interactions: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get-drug-details",
  "Get detailed information about a specific drug by NDC (National Drug Code)",
  {
    ndc: z.string().describe("National Drug Code (NDC) of the drug"),
  },
  async ({ ndc }) => {
    try {
      const drug = await getDrugByNDC(ndc);

      if (!drug) {
        return {
          content: [
            {
              type: "text",
              text: `No drug found with NDC: ${ndc}`,
            },
          ],
        };
      }

      let result = `**Drug Details for NDC: ${ndc}**\n\n`;
      result += `**Basic Information:**\n`;
      result += `- Brand Name: ${drug.openfda.brand_name?.[0] || "Not specified"}\n`;
      result += `- Generic Name: ${drug.openfda.generic_name?.[0] || "Not specified"}\n`;
      result += `- Manufacturer: ${drug.openfda.manufacturer_name?.[0] || "Not specified"}\n`;
      result += `- Route: ${drug.openfda.route?.[0] || "Not specified"}\n`;
      result += `- Dosage Form: ${drug.openfda.dosage_form?.[0] || "Not specified"}\n`;
      result += `- Last Updated: ${drug.effective_time}\n\n`;

      if (drug.purpose && drug.purpose.length > 0) {
        result += `**Purpose/Uses:**\n`;
        drug.purpose.forEach((purpose, index) => {
          result += `${index + 1}. ${purpose}\n`;
        });
        result += "\n";
      }

      if (drug.warnings && drug.warnings.length > 0) {
        result += `**Warnings:**\n`;
        drug.warnings.forEach((warning, index) => {
          result += `${index + 1}. ${warning}\n`;
        });
        result += "\n";
      }

      if (drug.drug_interactions && drug.drug_interactions.length > 0) {
        result += `**Drug Interactions:**\n`;
        drug.drug_interactions.forEach((interaction, index) => {
          result += `${index + 1}. ${interaction}\n`;
        });
        result += "\n";
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching drug details: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get-health-statistics",
  "Get health statistics and indicators from World Bank Open Data API with reliable global health data",
  {
    indicator: z
      .string()
      .describe(
        "Health indicator to search for (e.g., 'Life expectancy', 'Mortality rate', 'Infant mortality', 'Birth rate', 'Death rate', 'Population growth') or World Bank indicator code (e.g., 'SP.DYN.LE00.IN')",
      ),
    country: z
      .string()
      .optional()
      .describe("Country code (e.g., 'USA', 'GBR', 'CAN') - optional, omit for all countries"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (max 50)"),
  },
  async ({ indicator, country, limit }) => {
    try {
      const indicators = await getHealthIndicators(indicator, country);

      if (indicators.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No health indicators found for "${indicator}"${country ? ` in ${country}` : ""}.\n\nSupported indicators:\n• Life expectancy\n• Mortality rate / Infant mortality\n• Birth rate\n• Death rate\n• Population growth\n\nOr use World Bank indicator codes like:\n• SP.DYN.LE00.IN (Life expectancy)\n• SP.DYN.IMRT.IN (Infant mortality)\n• SP.DYN.CBRT.IN (Birth rate)\n\nTry a different search term or check your country code.`,
            },
          ],
        };
      }

      let result = `**Health Statistics: ${indicator}**\n\n`;
      if (country) {
        result += `Country Filter: ${country}\n`;
      }
      result += `Found ${indicators.length} data points from ${indicators[0]?.source || 'World Bank'}\n\n`;

      const displayIndicators = indicators.slice(0, limit);
      displayIndicators.forEach((ind, index) => {
        result += `${index + 1}. **${ind.country}** (${ind.year})\n`;
        result += `   Indicator: ${ind.indicator}\n`;
        result += `   Value: ${ind.value}${ind.unit ? ` ${ind.unit}` : ''}\n`;
        result += `   Country Code: ${ind.countryCode}\n`;
        result += `   Source: ${ind.source}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching health statistics: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-medical-literature",
  "Search for medical research articles in PubMed",
  {
    query: z.string().describe("Medical topic or condition to search for"),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe("Maximum number of articles to return (max 20)"),
  },
  async ({ query, max_results }) => {
    try {
      const articles = await searchPubMedArticles(query, max_results);

      if (articles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No medical articles found for "${query}". Try a different search term.`,
            },
          ],
        };
      }

      let result = `**Medical Literature Search: "${query}"**\n\n`;
      result += `Found ${articles.length} article(s)\n\n`;

      articles.forEach((article, index) => {
        result += `${index + 1}. **${article.title}**\n`;
        result += `   PMID: ${article.pmid}\n`;
        result += `   Journal: ${article.journal}\n`;
        result += `   Publication Date: ${article.publication_date}\n`;
        if (article.authors && article.authors.length > 0) {
          result += `   Authors: ${article.authors.join(", ")}\n`;
        }
        if (article.doi) {
          result += `   DOI: ${article.doi}\n`;
        }
        if (article.abstract) {
          result += `   Abstract: ${article.abstract}\n`;
        }
        result += "\n";
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching medical literature: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-drug-nomenclature",
  "Search for drug information using RxNorm (standardized drug nomenclature)",
  {
    query: z.string().describe("Drug name to search for in RxNorm database"),
  },
  async ({ query }) => {
    try {
      const drugs = await searchRxNormDrugs(query);

      if (drugs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No drugs found in RxNorm database for "${query}". Try a different search term.`,
            },
          ],
        };
      }

      let result = `**RxNorm Drug Search: "${query}"**\n\n`;
      result += `Found ${drugs.length} drug(s)\n\n`;

      drugs.forEach((drug, index) => {
        result += `${index + 1}. **${drug.name}**\n`;
        result += `   RxCUI: ${drug.rxcui}\n`;
        result += `   Term Type: ${drug.tty}\n`;
        result += `   Language: ${drug.language}\n`;
        if (drug.synonym && drug.synonym.length > 0) {
          result += `   Synonyms: ${drug.synonym.slice(0, 3).join(", ")}${drug.synonym.length > 3 ? "..." : ""}\n`;
        }
        result += "\n";
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching RxNorm: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-google-scholar",
  "Search for academic research articles using Google Scholar",
  {
    query: z
      .string()
      .describe("Academic topic or research query to search for"),
  },
  async ({ query }) => {
    try {
      const articles = await searchGoogleScholar(query);

      if (articles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No academic articles found for "${query}". This could be due to:\n- No results matching your query\n- Google Scholar rate limiting\n- Network connectivity issues\n\nTry refining your search terms or try again later.`,
            },
          ],
        };
      }

      let result = `**Google Scholar Search: "${query}"**\n\n`;
      result += `Found ${articles.length} article(s)\n\n`;

      articles.forEach((article, index) => {
        result += `${index + 1}. **${article.title}**\n`;
        if (article.authors) {
          result += `   Authors: ${article.authors}\n`;
        }
        if (article.journal) {
          result += `   Journal: ${article.journal}\n`;
        }
        if (article.year) {
          result += `   Year: ${article.year}\n`;
        }
        if (article.citations) {
          result += `   Citations: ${article.citations}\n`;
        }
        if (article.url) {
          result += `   URL: ${article.url}\n`;
        }
        if (article.abstract) {
          result += `   Abstract: ${article.abstract}\n`;
        }
        result += "\n";
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching Google Scholar: ${error.message || "Unknown error"}. This might be due to rate limiting or network issues. Please try again later.`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-adverse-events",
  "Search FDA adverse events database by reaction or drug name",
  {
    query: z
      .string()
      .describe("Reaction name (e.g., 'headache', 'nausea') or search term"),
    search_field: z
      .enum([
        "reactionmeddrapt",
        "medicinalproduct",
      ])
      .optional()
      .default("reactionmeddrapt")
      .describe("Field to search: 'reactionmeddrapt' for reactions, 'medicinalproduct' for drug names"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (max 50)"),
  },
  async ({ query, search_field, limit }) => {
    try {
      const events = await searchAdverseEvents(query, search_field, limit);

      if (events.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No adverse events found for "${query}" in ${search_field}. Try a different search term or field.`,
            },
          ],
        };
      }

      let result = `**Adverse Events Search Results for "${query}"**\n`;
      result += `Search Field: ${search_field}\n`;
      result += `Found ${events.length} event report(s)\n\n`;

      events.forEach((event, index) => {
        result += `${index + 1}. **Safety Report ID:** ${event.safetyreportid}\n`;
        result += `   Country: ${event.occurcountry || "Not specified"}\n`;
        result += `   Serious: ${event.serious === "1" ? "Yes" : event.serious === "2" ? "No" : "Unknown"}\n`;
        
        if (event.patient) {
          // Patient info
          if (event.patient.patientonsetage) {
            result += `   Patient Age: ${event.patient.patientonsetage} ${event.patient.patientonsetageunit === "801" ? "years" : "units"}\n`;
          }
          if (event.patient.patientsex) {
            const sex = event.patient.patientsex === "1" ? "Male" : event.patient.patientsex === "2" ? "Female" : "Unknown";
            result += `   Patient Sex: ${sex}\n`;
          }

          // Reactions
          if (event.patient.reaction && event.patient.reaction.length > 0) {
            result += `   Reactions:\n`;
            event.patient.reaction.slice(0, 3).forEach((reaction) => {
              if (reaction.reactionmeddrapt) {
                result += `   • ${reaction.reactionmeddrapt}\n`;
              }
            });
            if (event.patient.reaction.length > 3) {
              result += `   • ... and ${event.patient.reaction.length - 3} more reactions\n`;
            }
          }

          // Drugs
          if (event.patient.drug && event.patient.drug.length > 0) {
            result += `   Suspected Drug(s):\n`;
            event.patient.drug.slice(0, 2).forEach((drug) => {
              if (drug.medicinalproduct) {
                result += `   • ${drug.medicinalproduct}`;
                if (drug.drugindication) {
                  result += ` (for ${drug.drugindication})`;
                }
                result += "\n";
              }
            });
            if (event.patient.drug.length > 2) {
              result += `   • ... and ${event.patient.drug.length - 2} more drugs\n`;
            }
          }
        }

        result += `   Report Date: ${event.receivedate || "Not available"}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching adverse events: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-adverse-events-by-drug",
  "Search for adverse events associated with a specific drug",
  {
    drug_name: z
      .string()
      .describe("Drug name (brand or generic)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (max 50)"),
  },
  async ({ drug_name, limit }) => {
    try {
      const events = await searchAdverseEventsByDrug(drug_name, limit);

      if (events.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No adverse events found for drug "${drug_name}". Try checking the spelling or using a different drug name.`,
            },
          ],
        };
      }

      let result = `**Adverse Events for Drug: "${drug_name}"**\n\n`;
      result += `Found ${events.length} event report(s)\n\n`;

      events.forEach((event, index) => {
        result += `${index + 1}. **Safety Report ID:** ${event.safetyreportid}\n`;
        result += `   Serious: ${event.serious === "1" ? "Yes" : event.serious === "2" ? "No" : "Unknown"}\n`;
        
        // Serious event details
        if (event.serious === "1") {
          const seriousDetails = [];
          if (event.seriousnessdeath === "1") seriousDetails.push("Death");
          if (event.seriousnesshospitalization === "1") seriousDetails.push("Hospitalization");
          if (event.seriousnesslifethreatening === "1") seriousDetails.push("Life-threatening");
          if (event.seriousnessdisabling === "1") seriousDetails.push("Disability");
          if (seriousDetails.length > 0) {
            result += `   Serious Outcomes: ${seriousDetails.join(", ")}\n`;
          }
        }

        if (event.patient?.reaction && event.patient.reaction.length > 0) {
          result += `   Reported Reactions:\n`;
          event.patient.reaction.slice(0, 5).forEach((reaction) => {
            if (reaction.reactionmeddrapt) {
              result += `   • ${reaction.reactionmeddrapt}\n`;
            }
          });
          if (event.patient.reaction.length > 5) {
            result += `   • ... and ${event.patient.reaction.length - 5} more reactions\n`;
          }
        }

        result += `   Report Date: ${event.receivedate || "Not available"}\n`;
        result += `   Country: ${event.occurcountry || "Not specified"}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching adverse events by drug: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-serious-adverse-events",
  "Search for serious adverse events, optionally filtered by drug",
  {
    drug_name: z
      .string()
      .optional()
      .describe("Optional drug name to filter serious adverse events"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (max 50)"),
  },
  async ({ drug_name, limit }) => {
    try {
      const events = await getSeriousAdverseEvents(drug_name, limit);

      if (events.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No serious adverse events found${drug_name ? ` for drug "${drug_name}"` : ""}. Try a different search term or remove drug filter.`,
            },
          ],
        };
      }

      let result = `**Serious Adverse Events**\n`;
      if (drug_name) {
        result += `Filtered by Drug: "${drug_name}"\n`;
      }
      result += `\nFound ${events.length} serious event report(s)\n\n`;

      events.forEach((event, index) => {
        result += `${index + 1}. **Safety Report ID:** ${event.safetyreportid}\n`;
        
        // Serious outcomes breakdown
        const seriousOutcomes = [];
        if (event.seriousnessdeath === "1") seriousOutcomes.push("Death");
        if (event.seriousnesshospitalization === "1") seriousOutcomes.push("Hospitalization");
        if (event.seriousnesslifethreatening === "1") seriousOutcomes.push("Life-threatening");
        if (event.seriousnessdisabling === "1") seriousOutcomes.push("Disability");
        if (event.seriousnesscongenitalanomali === "1") seriousOutcomes.push("Congenital Anomaly");
        if (event.seriousnessother === "1") seriousOutcomes.push("Other Serious Condition");
        
        if (seriousOutcomes.length > 0) {
          result += `   Serious Outcomes: ${seriousOutcomes.join(", ")}\n`;
        }

        // Patient info
        if (event.patient) {
          if (event.patient.patientonsetage) {
            result += `   Patient Age: ${event.patient.patientonsetage} ${event.patient.patientonsetageunit === "801" ? "years" : "units"}\n`;
          }
          
          // Primary reactions
          if (event.patient.reaction && event.patient.reaction.length > 0) {
            result += `   Primary Reactions: ${event.patient.reaction.slice(0, 3).map(r => r.reactionmeddrapt).filter(Boolean).join(", ")}\n`;
          }

          // Drugs involved
          if (event.patient.drug && event.patient.drug.length > 0) {
            const suspectDrugs = event.patient.drug
              .filter(drug => drug.drugcharacterization === "1")
              .map(drug => drug.medicinalproduct)
              .filter(Boolean);
            if (suspectDrugs.length > 0) {
              result += `   Suspect Drug(s): ${suspectDrugs.slice(0, 2).join(", ")}\n`;
            }
          }
        }

        result += `   Country: ${event.occurcountry || "Not specified"}\n`;
        result += `   Report Date: ${event.receivedate || "Not available"}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching serious adverse events: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Medical MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
