import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, GraduationCap, Mail, Search } from "lucide-react";
import { CurriculumData } from "../types/curriculum";
import { availableCurricula } from "../data/availableCurricula";

interface CurriculumSelectorProps {
  onSelect: (data: CurriculumData) => void;
  onRequestCurriculum: () => void;
}

export default function CurriculumSelector({
  onSelect,
  onRequestCurriculum,
}: CurriculumSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredCurricula = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableCurricula;
    return availableCurricula.filter((c) => {
      const code = c.slug.replace(/^malla-/, "");
      return (
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        code.includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    });
  }, [search]);

  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus();
    } else {
      setSearch("");
    }
  }, [isOpen]);

  const handleCurriculumSelect = async (curriculumId: string) => {
    try {
      const curriculum = availableCurricula.find((c) => c.id === curriculumId);
      if (!curriculum) return;

      const module = await curriculum.dataLoader();
      const data = module.default as CurriculumData;
      // Ensure a stable identifier to persist progress per curriculum
      if (!data.source_file) {
        data.source_file = curriculumId;
      }
      // Update URL hash for GitHub Pages compatibility (#/slug)
      try {
        const slug = `/${curriculum.slug}`.replace(/\/+/, "/");
        window.location.hash = slug;
      } catch (e) {
        console.error("Error updating URL slug:", e);
      }
      onSelect(data);
      setIsOpen(false);
    } catch (error) {
      console.error("Error loading curriculum:", error);
    }
  };

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <GraduationCap className="w-4 h-4 mr-2" />
        Seleccionar Malla
        {isOpen ? (
          <ChevronUp className="w-4 h-4 ml-2" />
        ) : (
          <ChevronDown className="w-4 h-4 ml-2" />
        )}
      </Button>

      {isOpen && (
        <Card className="absolute top-full left-0 z-50 w-80 mt-2 dark:bg-gray-800 dark:border-gray-700 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg dark:text-white">
              Mallas Disponibles
            </CardTitle>
            <div className="relative pt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                ref={searchRef}
                type="search"
                placeholder="Buscar carrera..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder:text-gray-400"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 max-h-80 overflow-y-auto pt-0">
            {filteredCurricula.length === 0 ? (
              <div className="py-4 space-y-3 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No se encontró ninguna malla para &ldquo;{search}&rdquo;
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/20"
                  onClick={() => {
                    setIsOpen(false);
                    onRequestCurriculum();
                  }}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Solicita tu malla
                </Button>
              </div>
            ) : (
              filteredCurricula.map((curriculum) => (
              <div
                key={curriculum.id}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                onClick={() => handleCurriculumSelect(curriculum.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm dark:text-white">
                    {curriculum.name}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="text-xs dark:bg-gray-700 dark:text-gray-300"
                  >
                    {curriculum.year}
                  </Badge>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  {curriculum.description}
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-xs dark:border-gray-600 dark:text-gray-300"
                  >
                    {curriculum.credits} créditos
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-xs dark:border-gray-600 dark:text-gray-300"
                  >
                    {curriculum.courses} materias
                  </Badge>
                </div>
              </div>
            ))
            )}

            <div
              className="p-3 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
              onClick={() => {
                setIsOpen(false);
                onRequestCurriculum();
              }}
            >
              <div className="flex items-center justify-center mb-2">
                <Mail className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
                <h3 className="font-medium text-sm text-blue-800 dark:text-blue-200">
                  Solicita tu malla
                </h3>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 text-center">
                ¿No encuentras tu carrera? Solicítala aquí
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
