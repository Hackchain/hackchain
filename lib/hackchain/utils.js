'use strict';

exports.binarySearch = function binarySearch(haystack, needle, compare) {
  let left = 0;
  let right = haystack.length - 1;

  while (left <= right) {
    const middle = (left + right) >>> 1;
    const cmp = compare(needle, haystack[middle]);

    if (cmp === 0)
      return middle;
    else if (cmp < 0)
      right = middle - 1;
    else
      left = middle + 1;
  }

  return left;
};
