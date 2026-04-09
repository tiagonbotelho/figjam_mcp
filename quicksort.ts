/**
 * Sorts an array of numbers using the quicksort algorithm.
 *
 * Selects the middle element as the pivot, then recursively sorts
 * the sub-arrays of elements less than and greater than the pivot.
 *
 * @param arr - The array of numbers to sort.
 * @returns A new sorted array in ascending order.
 */
function quicksort(arr: number[]): number[] {
  if (arr.length <= 1) {
    return arr;
  }

  const pivot = arr[Math.floor(arr.length / 2)];
  const left = arr.filter((x) => x < pivot);
  const middle = arr.filter((x) => x === pivot);
  const right = arr.filter((x) => x > pivot);

  return [...quicksort(left), ...middle, ...quicksort(right)];
}

const input = [3, 6, 8, 10, 1, 2, 1];
console.log("Input: ", input);
console.log("Sorted:", quicksort(input));
