def quicksort(arr: list[int]) -> list[int]:
    """Sort a list of integers using the quicksort algorithm.

    Selects the middle element as the pivot, then recursively sorts
    the sub-lists of elements less than and greater than the pivot.

    Args:
        arr: The list of integers to sort.

    Returns:
        A new sorted list in ascending order.
    """
    if len(arr) <= 1:
        return arr

    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]

    return quicksort(left) + middle + quicksort(right)


if __name__ == "__main__":
    input_arr = [3, 6, 8, 10, 1, 2, 1]
    print("Input: ", input_arr)
    print("Sorted:", quicksort(input_arr))
