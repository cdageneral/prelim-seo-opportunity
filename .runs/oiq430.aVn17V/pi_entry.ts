import { buildProductRows, buildCategoryToUmbrella, probeResultsForUmbrella } from '@/lib/productInsights';
import { buildAssessmentHTML } from '@/lib/pdf/assessmentTemplate';
(globalThis as any).__x = { buildProductRows, buildCategoryToUmbrella, probeResultsForUmbrella, buildAssessmentHTML };
