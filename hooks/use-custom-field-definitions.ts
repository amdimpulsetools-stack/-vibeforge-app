"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import type {
  CustomFieldDefinition,
  CustomFieldEntity,
} from "@/types/custom-fields";

interface UseCustomFieldDefinitionsResult {
  definitions: CustomFieldDefinition[];
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches active custom field definitions for the current org and entity.
 * Returns an empty array when the org has no definitions configured — the
 * caller can therefore render unconditionally without checking the plan flag.
 */
export function useCustomFieldDefinitions(
  entityType: CustomFieldEntity,
): UseCustomFieldDefinitionsResult {
  const { organizationId } = useOrganization();
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDefinitions = useCallback(async () => {
    if (!organizationId) {
      setDefinitions([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("custom_field_definitions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_type", entityType)
      .eq("active", true)
      .order("position", { ascending: true });
    setDefinitions((data ?? []) as CustomFieldDefinition[]);
    setLoading(false);
  }, [organizationId, entityType]);

  useEffect(() => {
    fetchDefinitions();
  }, [fetchDefinitions]);

  return { definitions, loading, refetch: fetchDefinitions };
}
