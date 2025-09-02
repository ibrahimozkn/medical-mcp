# Medical MCP Server
[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/JamesANZ/medical-mcp)](https://archestra.ai/mcp-catalog/jamesanz__medical-mcp)

A Model Context Protocol (MCP) server that provides medical research information by querying PubMed and Google Scholar.

## Features

This MCP server offers two tools for querying medical literature from reliable sources:

### 🔬 Medical Literature Tools

#### `search-medical-literature`

Search for medical research articles in PubMed.

**Input:**

- `query` (string): Medical topic or condition to search for
- `max_results` (optional, number): Maximum number of articles to return (1-20, default: 10)

**Output:**

- Medical research articles with titles, PMIDs, journals, and publication dates

**Example:**

```
Medical Literature Search: "diabetes treatment"

Found 10 article(s)

1. **Novel Approaches to Diabetes Management**
   PMID: 12345678
   Journal: New England Journal of Medicine
   Publication Date: 2024-01-15
```

#### `search-google-scholar`

Search for academic research articles using Google Scholar.

**Input:**

- `query` (string): Academic topic or research query to search for

**Output:**

- Academic research articles with titles, authors, abstracts, journals, years, citations, and URLs

**Example:**

```
Google Scholar Search: "machine learning healthcare"

Found 10 article(s)

1. **Machine Learning in Healthcare: A Systematic Review**
   Authors: Smith J, Johnson A - Journal of Medical AI
   Year: 2023
   Citations: Cited by 45
   URL: https://scholar.google.com/...
   Abstract: This systematic review examines the application of machine learning...
```

**Note:** This tool uses web scraping to access Google Scholar since it doesn't provide a public API. It includes rate limiting protection and stealth measures to avoid detection.

## Installation

1. Clone this repository:

```bash
git clone <repository-url>
cd medical-mcp
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

## Usage

### Running the Server

Start the MCP server:

```bash
npm start
```

The server runs on stdio and can be connected to any MCP-compatible client.

### Example Queries

Here are some example queries you can make with this MCP server:

#### Search Google Scholar

```json
{
  "tool": "search-google-scholar",
  "arguments": {
    "query": "machine learning healthcare"
  }
}
```

#### Search Medical Literature

```json
{
  "tool": "search-medical-literature",
  "arguments": {
    "query": "COVID-19 treatment",
    "max_results": 10
  }
}
```

#### Search Drug Nomenclature

```json
{
  "tool": "search-drug-nomenclature",
  "arguments": {
    "query": "aspirin"
  }
}
```

## API Endpoints

This MCP server integrates with the following sources:

### PubMed API

- `GET /esearch.fcgi` - Search for medical articles
- `GET /efetch.fcgi` - Retrieve article details
- Access to millions of medical research papers

### Google Scholar (Web Scraping)

- Web scraping of Google Scholar search results
- Academic research article discovery
- Citation and publication information
- **Note**: Uses Puppeteer for browser automation with anti-detection measures

## Data Sources

### PubMed (National Library of Medicine)

- **Source**: MEDLINE database of medical literature
- **Coverage**: Over 30 million citations from medical journals
- **Data**: Research articles, clinical studies, and medical reviews
- **Update Frequency**: Daily updates as new articles are published

### Google Scholar (Web Scraping)

- **Source**: Google Scholar academic search engine
- **Coverage**: Academic papers, theses, books, and abstracts across all disciplines
- **Data**: Research articles, citations, authors, journals, and publication dates
- **Update Frequency**: Real-time as new papers are indexed
- **Note**: Access via web scraping with rate limiting protection

## Error Handling

The server includes comprehensive error handling:

- Network errors are caught and reported with descriptive messages
- Invalid queries return appropriate error messages
- Rate limiting and API errors are handled gracefully
- Fallback responses when specific APIs are unavailable

## Web Scraping Implementation

The Google Scholar integration uses Puppeteer for web scraping with the following features:

### Anti-Detection Measures

- **Stealth Mode**: Browser launched with multiple flags to avoid detection
- **User Agent Spoofing**: Realistic browser user agent strings
- **Random Delays**: Built-in delays between requests to avoid rate limiting
- **Header Spoofing**: Realistic HTTP headers to appear as a regular browser
- **Viewport Settings**: Standard desktop viewport dimensions

### Robust Parsing

- **Multiple Selectors**: Uses various CSS selectors to handle different Google Scholar layouts
- **Fallback Strategies**: Multiple parsing approaches for different page structures
- **Error Recovery**: Graceful handling of missing elements or changed page structures
- **Data Validation**: Filters out incomplete or invalid results

### Rate Limiting Protection

- **Random Delays**: 1-3 second random delays between requests
- **Browser Management**: Proper browser cleanup to prevent resource leaks
- **Timeout Handling**: Configurable timeouts for network requests
- **Error Recovery**: Automatic retry logic for failed requests

## Medical Disclaimer

**Important**: This MCP server provides information from authoritative medical sources but should not be used as a substitute for professional medical advice, diagnosis, or treatment. Always consult with qualified healthcare professionals for medical decisions.

- The information provided is for educational and informational purposes only
- Drug information may not be complete or up-to-date for all medications
- Health statistics are aggregated data and may not reflect individual circumstances
- Medical literature should be interpreted by qualified healthcare professionals

## Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK for server implementation
- `superagent` - HTTP client for API requests
- `puppeteer` - Browser automation for web scraping Google Scholar
- `zod` - Schema validation for tool parameters

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
