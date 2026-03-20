export type ProblemSource = 'disk' | 'image' | 'text';

export type ProblemSummary = {
  name: string;
  title: string;
  source: ProblemSource;
  confidence?: number;
  parser_model?: string;
  original_filename?: string;
  image_url?: string | null;
  statement_preview: string;
  sample_input_preview: string;
  sample_output_preview: string;
};
