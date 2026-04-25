export const getLevenshteinDistance = (left: string, right: string) => {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const currentRow = [leftIndex + 1];

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      currentRow[rightIndex + 1] = Math.min(
        currentRow[rightIndex]! + 1,
        previousRow[rightIndex + 1]! + 1,
        previousRow[rightIndex]! + substitutionCost
      );
    }

    previousRow = currentRow;
  }

  return previousRow[right.length] ?? Number.POSITIVE_INFINITY;
};
