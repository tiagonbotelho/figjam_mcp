defmodule Quicksort do
  def sort([]), do: []
  def sort([pivot | rest]) do
    less    = Enum.filter(rest, &(&1 <= pivot))
    greater = Enum.filter(rest, &(&1 > pivot))
    sort(less) ++ [pivot] ++ sort(greater)
  end
end

IO.inspect(Quicksort.sort([3, 6, 8, 10, 1, 2, 1]))
