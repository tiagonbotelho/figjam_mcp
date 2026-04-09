# Sorts an array of integers using the quicksort algorithm.
#
# Selects the middle element as the pivot, then recursively sorts
# the sub-arrays of elements less than and greater than the pivot.
#
# @param arr [Array<Integer>] the array to sort
# @return [Array<Integer>] a new sorted array in ascending order
def quicksort(arr)
  return arr if arr.length <= 1

  pivot = arr[arr.length / 2]
  left = arr.select { |x| x < pivot }
  middle = arr.select { |x| x == pivot }
  right = arr.select { |x| x > pivot }

  quicksort(left) + middle + quicksort(right)
end

input = [3, 6, 8, 10, 1, 2, 1]
puts "Input:  #{input}"
puts "Sorted: #{quicksort(input)}"
