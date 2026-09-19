import { useState, useEffect, useCallback } from "react";
import { CustomGenre } from "../../types/customGenre";
import { Genre, GenreCategory } from "../../types/genre";
import { 
  getAllCustomGenres, 
  getCustomGenre, 
  saveCustomGenre, 
  deleteCustomGenre, 
  duplicateCustomGenre,
  createBlankCustomGenre,
  forkGenre
} from "./customGenreDb";

export function useCustomGenres() {
  const [customGenres, setCustomGenres] = useState<CustomGenre[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshList = useCallback(async () => {
    try {
      const list = await getAllCustomGenres();
      setCustomGenres(list);
    } catch (err) {
      console.error("Failed to load custom genres:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();

    const handleUpdate = () => {
      refreshList();
    };

    window.addEventListener("groove_custom_genres_changed", handleUpdate);
    return () => window.removeEventListener("groove_custom_genres_changed", handleUpdate);
  }, [refreshList]);

  const handleSave = useCallback(async (genre: CustomGenre) => {
    await saveCustomGenre(genre);
    await refreshList();
  }, [refreshList]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteCustomGenre(id);
    await refreshList();
  }, [refreshList]);

  const handleDuplicate = useCallback(async (id: string) => {
    const copy = await duplicateCustomGenre(id);
    await refreshList();
    return copy;
  }, [refreshList]);

  const handleFork = useCallback(async (base: Genre, customName?: string) => {
    const forked = forkGenre(base, customName);
    await saveCustomGenre(forked);
    await refreshList();
    return forked;
  }, [refreshList]);

  const handleCreateBlank = useCallback(async (name?: string, category?: GenreCategory) => {
    const blank = createBlankCustomGenre(name, category);
    await saveCustomGenre(blank);
    await refreshList();
    return blank;
  }, [refreshList]);

  return {
    customGenres,
    isLoading,
    refreshList,
    saveCustomGenre: handleSave,
    deleteCustomGenre: handleDelete,
    duplicateCustomGenre: handleDuplicate,
    forkGenre: handleFork,
    createBlankCustomGenre: handleCreateBlank,
    getCustomGenre,
  };
}
