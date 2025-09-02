export type DrugLabel = {
  openfda: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    product_ndc?: string[];
    substance_name?: string[];
    route?: string[];
    dosage_form?: string[];
    application_number?: string[];
    pharm_class_cs?: string[];
    pharm_class_epc?: string[];
    pharm_class_pe?: string[];
    pharm_class_moa?: string[];
    rxcui?: string[];
    unii?: string[];
  };
  // Core drug information fields
  purpose?: string[];
  warnings?: string[];
  adverse_reactions?: string[];
  drug_interactions?: string[];
  dosage_and_administration?: string[];
  clinical_pharmacology?: string[];
  indications_and_usage?: string[];
  contraindications?: string[];
  active_ingredient?: string[];
  inactive_ingredient?: string[];
  mechanism_of_action?: string[];
  pharmacokinetics?: string[];
  pharmacodynamics?: string[];
  boxed_warning?: string[];
  precautions?: string[];
  overdosage?: string[];
  how_supplied?: string[];
  storage_and_handling?: string[];
  description?: string[];
  // Special population fields
  pregnancy?: string[];
  nursing_mothers?: string[];
  pediatric_use?: string[];
  geriatric_use?: string[];
  // Additional safety information
  abuse?: string[];
  dependence?: string[];
  controlled_substance?: string[];
  information_for_patients?: string[];
  laboratory_tests?: string[];
  carcinogenesis_and_mutagenesis_and_impairment_of_fertility?: string[];
  nonclinical_toxicology?: string[];
  clinical_studies?: string[];
  references?: string[];
  effective_time: string;
  id?: string;
  set_id?: string;
  version?: string;
};

export type WHOIndicator = {
  IndicatorCode: string;
  IndicatorName: string;
  SpatialDimType: string;
  SpatialDim: string;
  TimeDim: string;
  TimeDimType: string;
  DataSourceDim: string;
  DataSourceType: string;
  Value: number;
  NumericValue: number;
  Low: number;
  High: number;
  Comments: string;
  Date: string;
};

export type HealthIndicator = {
  country: string;
  countryCode: string;
  indicator: string;
  indicatorCode: string;
  year: string;
  value: number | null;
  unit: string;
  source: 'WHO' | 'World Bank';
};

export type RxNormDrug = {
  rxcui: string;
  name: string;
  synonym: string[];
  tty: string;
  language: string;
  suppress: string;
  umlscui: string[];
};

export type PubMedArticle = {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  publication_date: string;
  doi?: string;
};

export type GoogleScholarArticle = {
  title: string;
  authors?: string;
  abstract?: string;
  journal?: string;
  year?: string;
  citations?: string;
  url?: string;
  pdf_url?: string;
  related_articles?: string[];
};

export type AdverseEvent = {
  safetyreportid: string;
  safetyreportversion?: string;
  receivedate?: string;
  receiptdate?: string;
  serious?: string;
  seriousnessdeath?: string;
  seriousnesshospitalization?: string;
  seriousnesslifethreatening?: string;
  seriousnessdisabling?: string;
  seriousnesscongenitalanomali?: string;
  seriousnessother?: string;
  transmissiondate?: string;
  occurcountry?: string;
  primarysourcecountry?: string;
  reporttype?: string;
  fulfillexpeditecriteria?: string;
  companynumb?: string;
  duplicate?: string;
  patient?: {
    patientonsetage?: string;
    patientonsetageunit?: string;
    patientsex?: string;
    patientagegroup?: string;
    patientweight?: string;
    patientdeath?: {
      patientdeathdate?: string;
      patientdeathdateformat?: string;
    };
    drug?: Array<{
      medicinalproduct?: string;
      drugcharacterization?: string;
      drugindication?: string;
      drugstartdate?: string;
      drugenddate?: string;
      drugstructuredosagenumb?: string;
      drugstructuredosageunit?: string;
      drugdosageform?: string;
      drugadministrationroute?: string;
      actiondrug?: string;
      drugrecurreadministration?: string;
      activesubstance?: {
        activesubstancename?: string;
      };
      openfda?: {
        application_number?: string[];
        brand_name?: string[];
        generic_name?: string[];
        manufacturer_name?: string[];
        package_ndc?: string[];
        product_ndc?: string[];
        product_type?: string[];
        route?: string[];
        substance_name?: string[];
        rxcui?: string[];
        spl_id?: string[];
        spl_set_id?: string[];
        pharm_class_cs?: string[];
        pharm_class_epc?: string[];
        pharm_class_pe?: string[];
        pharm_class_moa?: string[];
        nui?: string[];
        unii?: string[];
      };
    }>;
    reaction?: Array<{
      reactionmeddrapt?: string;
      reactionmeddraversionpt?: string;
      reactionoutcome?: string;
    }>;
    summary?: {
      narrativeincludeclinical?: string;
    };
  };
  primarysource?: {
    qualification?: string;
    reportercountry?: string;
    literaturereference?: string;
  };
  sender?: {
    sendertype?: string;
    senderorganization?: string;
  };
  receiver?: {
    receivertype?: string;
    receiverorganization?: string;
  };
  reportduplicate?: {
    duplicatenumb?: string;
    duplicatesource?: string;
  };
};
