---
title: Domain Prompt Playbook
description: Domain-specific system prompts for knowledge graph extraction
---

# Domain Prompt Playbook

Use these templates to swap out the default plant-science prompts when working in other research domains. Copy the relevant section into `backend/services/SimpleAnalysisService.js` (or your prompt injection layer) and adjust entity types or relationship labels as needed.

Each domain includes three variants:
- `csv_metadata_analysis`: for CSV/metadata uploads
- `knowledge_graph`: for full-text (PDF/JSON) ingestion
- `knowledge_graph_chunk`: for chunk-level processing during streaming or batching

---

## Medical Science

### csv_metadata_analysis
```text
TASK: Analyze the following CSV metadata from medical/clinical literature and construct a high-precision Knowledge Graph schema.

CONTEXT: This dataset contains bibliographic information from peer-reviewed biomedical journals (e.g., PubMed, Lancet, NEJM). It covers clinical trials, molecular biology, epidemiology, and pharmaceutical research.

DATA CHARACTERISTICS:
- Includes titles, abstracts, MeSH keywords, and study types
- Focuses on pathology, pharmacology, diagnostics, and treatment outcomes
- Contains mixed entities: Genes, Proteins, Drugs, Diseases, and Phenotypes

ANALYSIS REQUIREMENTS:
1. **Clinical Entities & Phenotypes**: Map diseases, symptoms, and syndromes (align with ICD-10/SNOMED CT concepts where possible).
2. **Therapeutic Interventions**: Extract drugs (generic/brand), surgeries, and lifestyle modifications.
3. **Molecular Mechanisms**: Identify key biomarkers, proteins, genetic variants, and signaling pathways.
4. **Study Parameters**: Detect study design (RCT, Cohort), sample size (n), and p-values/confidence intervals if present.
5. **Causality & Correlation**: Distinctly categorize relationships (e.g., "Treats", "Causes", "Associated_With", "Upregulates").
6. **Outcomes**: Identify primary and secondary endpoints (e.g., survival rate, symptom reduction).

QUALITY STANDARDS:
- **Precision**: Distinguish between 'Hypothetical' (in silico/in vitro) and 'Confirmed' (clinical) relationships.
- **Disambiguation**: Resolve abbreviations (e.g., 'Ca' could be Calcium or Cancer - derive from context).
- **Hierarchical Structure**: Organize from general System (e.g., Cardiovascular) to specific Molecular Target (e.g., ACE2 receptor).
- **Evidence Level**: Prioritize findings from systematic reviews and RCTs over case studies.

CSV METADATA TO ANALYZE:
${textToAnalyze}

Extract a sophisticated knowledge graph that links clinical manifestations with underlying molecular mechanisms.
```

### knowledge_graph
```text
TASK: Construct a comprehensive Biomedical Knowledge Graph from the following full-text content.

ANALYSIS FOCUS: Extract deep pathophysiological mechanisms, drug-target interactions, and clinical guidelines. Prioritize the PICO framework (Patient, Intervention, Comparison, Outcome).

KEY ENTITY TYPES TO EXTRACT:
- [Disease/Condition]
- [Chemical/Drug]
- [Gene/Protein]
- [Anatomy]
- [Procedure]
- [Adverse Event]

RELATIONSHIP TYPES TO PRIORITIZE:
- TARGETS (Drug -> Protein)
- INDICATES (Symptom -> Disease)
- CONTRAINDICATES (Condition -> Drug)
- METABOLIZES (Enzyme -> Drug)
- CAUSES_SIDE_EFFECT (Drug -> Symptom)

CONTENT TO ANALYZE:
${textToAnalyze}

Generate a rich, hierarchical knowledge graph that serves as a foundation for Clinical Decision Support (CDS) systems.
```

### knowledge_graph_chunk
```text
TASK: Perform Named Entity Recognition (NER) and Relation Extraction (RE) on this specific medical text chunk. Focus on preserving the semantic context of medical abbreviations and dosage information for subsequent merging.
```

---

## Material Engineering

### csv_metadata_analysis
```text
TASK: Analyze the following CSV metadata from Materials Science & Semiconductor literature to construct a high-precision Knowledge Graph schema.

CONTEXT: This dataset contains bibliographic information from high-impact journals (e.g., Nature Materials, IEEE TED, Advanced Materials, ACS Nano). It covers semiconductor physics, nanotechnology, metallurgy, and polymer science.

DATA CHARACTERISTICS:
- Includes titles, abstracts, chemical formulas, and synthesis methods.
- Focuses on crystal structure, electronic/optical properties, and device performance.
- Contains mixed entities: Elements, Compounds, Alloys, Fabrication Processes, and Characterization Metrics.

ANALYSIS REQUIREMENTS:
1. **Material Composition & Phase**: Extract standardized chemical formulas (stoichiometry) and identify phases (e.g., Amorphous vs. Crystalline, Rutile vs. Anatase).
2. **Synthesis & Processing (Processing)**: Identify fabrication methods (e.g., CVD, ALD, Sputtering, Sol-gel) and critical parameters (Temperature, Pressure, Precursors).
3. **Microstructure & Defects (Structure)**: Detect grain boundaries, dislocations, doping levels, and nano-features.
4. **Physicochemical Properties (Property)**: Extract quantitative properties (e.g., Bandgap, Electron Mobility, Young's Modulus, Thermal Conductivity) with units.
5. **Device Application & Metrics (Performance)**: Map materials to applications (e.g., MOSFET, LED, Battery) and performance metrics (e.g., PCE %, On/Off Ratio).
6. **Methodology Type**: Distinguish between 'Experimental' (Empirical) and 'Computational' (DFT, MD Simulation, FEA).

QUALITY STANDARDS:
- **Disambiguation**: Distinguish between the 'Material' itself (e.g., Graphene) and the 'Substrate' or 'Dopant'.
- **Normalization**: Standardize units to SI units where applicable (e.g., convert eV to J if needed for schema, though eV is standard in semiconductors).
- **Hierarchical Structure**: Organize from Material Class (e.g., 2D Materials) to Specific Composition (e.g., MoS2) to Property (e.g., Direct Bandgap).
- **Causality**: Capture process-property relationships (e.g., "Annealing at 500°C" -> "Increases Crystallinity").

CSV METADATA TO ANALYZE:
${textToAnalyze}

Extract a sophisticated knowledge graph that links material compositions and processing history with resultant properties and performance.
```

### knowledge_graph
```text
TASK: Construct a comprehensive Materials Knowledge Graph (MKG) from the following full-text content based on the PSPP (Processing-Structure-Property-Performance) framework.

ANALYSIS FOCUS: Extract the causal chain of material fabrication, structural characterization, and functional performance. Prioritize distinguishing between 'Host Material', 'Dopant', and 'Interface'.

KEY ENTITY TYPES TO EXTRACT:
- [Material/Compound] (Standardize Formula, e.g., 'Silicon Dioxide' -> 'SiO2')
- [Process/Method] (e.g., 'Photolithography', 'Etching')
- [Condition/Parameter] (e.g., '300K', '5 GPa', 'High Vacuum')
- [Property/Descriptor] (e.g., 'Refractive Index', 'Carrier Lifetime')
- [Characterization_Technique] (e.g., 'XRD', 'TEM', 'Raman Spectroscopy')
- [Device/Application]

RELATIONSHIP TYPES TO PRIORITIZE:
- HAS_COMPOSITION (Material -> Formula)
- SYNTHESIZED_BY (Material -> Process)
- HAS_PARAMETER (Process -> Condition)
- EXHIBITS_PROPERTY (Material -> Property)
- CHARACTERIZED_BY (Property -> Technique)
- APPLIED_IN (Material -> Device)
- AFFECTS (Condition -> Property) [e.g., Temperature affects Conductivity]

CONTENT TO ANALYZE:
${textToAnalyze}

Generate a rich, hierarchical knowledge graph that serves as a foundation for Materials Informatics and Inverse Design systems.
```

### knowledge_graph_chunk
```text
TASK: Perform Named Entity Recognition (NER) and Relation Extraction (RE) on this specific materials science text chunk.

CRITICAL INSTRUCTIONS:
1. **Chemical Formula Parsing**: Ensure accurate extraction of subscripts and stoichiometry (e.g., distinguish Fe2O3 from Fe3O4).
2. **Unit Association**: Strictly bind numerical values to their physical units and the associated property (e.g., "5.2 eV" must be linked to "Bandgap", not just treated as a number).
3. **Context Preservation**: Maintain the link between specific processing conditions and the resulting material phase.
```

---

## Computer Science

### csv_metadata_analysis
```text
TASK: Analyze the following CSV metadata from Computer Science/AI literature and construct a high-precision Knowledge Graph schema.

CONTEXT: This dataset contains bibliographic information from top-tier CS conferences and journals (e.g., NeurIPS, CVPR, ICML, IEEE TPAMI, ACM SIGGRAPH). It covers Deep Learning, System Architecture, Software Engineering, and Hardware Acceleration.

DATA CHARACTERISTICS:
- Includes titles, abstracts, author keywords, and arXiV categories (e.g., cs.CL, cs.CV, cs.LG).
- Focuses on Model Architecture, Algorithmic Optimization, Benchmarking, and Implementation.
- Contains mixed entities: Algorithms, Frameworks, Hardware Spec, Datasets, and Evaluation Metrics.

ANALYSIS REQUIREMENTS:
1. **Core Concepts & Tasks**: Map specific tasks (e.g., Object Detection, Code Generation) to broad fields (e.g., Computer Vision, NLP).
2. **Methodologies & Architectures**: Extract specific model names (e.g., Transformer, ResNet), mechanisms (e.g., Attention, Backpropagation), and optimization techniques (e.g., Quantization, Pruning).
3. **Tech Stack & Frameworks**: Identify libraries (PyTorch, TensorFlow, React), languages (Python, Rust), and hardware (H100, TPU v4).
4. **Experimental Setup**: Detect hyperparameters, batch sizes, training compute (FLOPs), and ablation study details.
5. **Performance & Causality**: Distinctly categorize relationships (e.g., "Outperforms", "Optimizes", "Based_On", "Compatible_With").
6. **Benchmarks & Metrics**: Identify datasets used (e.g., ImageNet, HumanEval) and specific scores (Accuracy, F1-Score, Latency, Throughput).

QUALITY STANDARDS:
- **Precision**: Distinguish between 'Proposed Method' (Contribution) and 'Baseline' (Comparison).
- **Disambiguation**: Resolve acronyms based on context (e.g., 'BERT' could be the model or a specific variant; 'GNN' vs 'CNN').
- **Hierarchical Structure**: Organize from General Field (e.g., AI) -> Sub-field (e.g., NLP) -> Specific Technique (e.g., LoRA).
- **Novelty Detection**: Prioritize identifying the paper's specific contribution (SOTA achievement or efficiency gain).

CSV METADATA TO ANALYZE:
${textToAnalyze}

Extract a sophisticated knowledge graph that links computational problems with algorithmic solutions and performance metrics.
```

### knowledge_graph
```text
TASK: Construct a comprehensive Computer Science Knowledge Graph from the following full-text content.

ANALYSIS FOCUS: Extract System Design patterns, Algorithmic logic, and Empirical results. Prioritize the **Problem-Method-Metric-Result** framework.

KEY ENTITY TYPES TO EXTRACT:
- [Task/Problem] (e.g., Image Segmentation, Memory Leak)
- [Method/Model] (e.g., Diffusion Model, Microservices)
- [Dataset/Benchmark] (e.g., COCO, LeetCode Dataset)
- [Metric/Evaluation] (e.g., BLEU, O(n) Complexity)
- [Tool/Framework] (e.g., Docker, CUDA, LangChain)
- [Hardware/Platform] (e.g., Edge Device, Cloud Cluster)

RELATIONSHIP TYPES TO PRIORITIZE:
- SOLVES (Method -> Task)
- EVALUATED_ON (Method -> Dataset)
- OUTPERFORMS (Method -> Method)
- USES (Method -> Tool/Framework)
- SUBCLASS_OF (Model -> Architecture)
- ACHIEVES (Method -> Metric Value)

CONTENT TO ANALYZE:
${textToAnalyze}

Generate a rich, hierarchical knowledge graph that serves as a foundation for Code Generation RAG or Technical Trend Analysis systems.
```

### knowledge_graph_chunk
```text
TASK: Perform Named Entity Recognition (NER) and Relation Extraction (RE) on this specific technical text chunk.

CRITICAL INSTRUCTIONS:
1. **Code & Math Preservation**: Treat code snippets (inline or block) and LaTeX equations as atomic entities or attributes. Do not hallucinate relationships inside a code block.
2. **Version Sensitivity**: Pay attention to version numbers (e.g., 'GPT-4' vs 'GPT-3.5', 'Python 3.11' vs '3.8') as they represent distinct entities.
3. **Contextual Acronyms**: Ensure distinct mapping for overlapping terms (e.g., 'IP' could be Intellectual Property or Internet Protocol).
```

---

## How to Use These Prompts

1. Copy the domain block into your desired prompt handler (e.g., `generateAnalysisPrompt`).
2. Update `analysisType` routing or create UI toggles so analysts can select their domain.
3. Adjust entity/relationship labels to match your downstream schema or ontology.
4. Keep this file updated as new domains are added; contributions are welcome!

